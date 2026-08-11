import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  debriefRequestSchema,
  historySchema,
  predictRequestSchema,
  profileSummarySchema,
  revealRequestSchema,
  sanitizeDebrief,
  sanitizeInterpretation,
  sanitizePrediction,
  scrub,
  trimWords,
} from '@/lib/ai/schemas';
import { computeDrift, localDebrief, localInterpretation, localPrediction } from '@/lib/behavior/narrative';
import { hydrateProfile, seedFrom } from '@/lib/behavior/hydrate';
import { deriveProfile, summarizeProfile } from '@/lib/behavior/profile';
import { MODEL, OUTPUT_TOKENS, REASONING_EFFORT } from '@/lib/ai/client';
import { buildRounds, buildTrials } from './factories';

/**
 * The OpenAI client is replaced wholesale. Nothing in this file makes a network
 * call; what is under test is the decision tree around the call — mock mode,
 * refusal, malformed output, exception, timeout — and that every branch produces
 * something the game can use.
 */
const parse = vi.fn();
vi.mock('@/lib/ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/client')>();
  return {
    ...actual,
    getOpenAI: () => ({ responses: { parse } }),
  };
});

const { generateDebrief, generateInterpretation, generatePrediction } = await import('@/lib/ai');

const summary = () =>
  summarizeProfile(
    deriveProfile(
      buildTrials([
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'two', rewarded: false },
        { option: 'one', rewarded: true },
      ]),
    ),
  );

const history = () => [
  { round: 1, choice: 'A' as const, win: true, ms: 800 },
  { round: 2, choice: 'A' as const, win: false, ms: 640 },
];

beforeEach(() => {
  parse.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Put the code on the real-model path without any real key or network. */
function useRealModelPath() {
  vi.stubEnv('MOCK_AI', '');
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
}

describe('fixed call parameters', () => {
  it('pins the model, effort and output ceilings server-side', () => {
    expect(MODEL).toBe('gpt-5.6-luna');
    expect(REASONING_EFFORT).toBe('low');
    expect(OUTPUT_TOKENS.predict).toBeLessThanOrEqual(200);
    expect(OUTPUT_TOKENS.interpret).toBeLessThanOrEqual(400);
    expect(OUTPUT_TOKENS.debrief).toBeLessThanOrEqual(600);
  });
});

describe('sanitizePrediction', () => {
  it('accepts a well-formed structured output', () => {
    const clean = sanitizePrediction({ prediction: 'B', confidence: 0.72, explanation: 'Leaves after a miss.' });
    expect(clean).toEqual({ prediction: 'B', confidence: 0.72, explanation: 'Leaves after a miss.' });
  });

  it('rejects a missing or invalid prediction rather than guessing', () => {
    expect(sanitizePrediction({ confidence: 0.7, explanation: 'x' })).toBeNull();
    expect(sanitizePrediction({ prediction: 'C', confidence: 0.7, explanation: 'x' })).toBeNull();
    expect(sanitizePrediction({ prediction: 'A', confidence: 'high', explanation: 'x' })).toBeNull();
    expect(sanitizePrediction(null)).toBeNull();
    expect(sanitizePrediction('A')).toBeNull();
  });

  it('clamps overconfident and underconfident claims', () => {
    expect(sanitizePrediction({ prediction: 'A', confidence: 1, explanation: 'x' })?.confidence).toBe(0.95);
    expect(sanitizePrediction({ prediction: 'A', confidence: 0.1, explanation: 'x' })?.confidence).toBe(0.5);
  });

  it('treats a non-finite confidence as unusable output rather than repairing it', () => {
    // A NaN confidence means the response is malformed, so the correct answer is
    // to fall back to the local engine, not to invent a plausible number.
    expect(sanitizePrediction({ prediction: 'A', confidence: Number.NaN, explanation: 'x' })).toBeNull();
    expect(sanitizePrediction({ prediction: 'A', confidence: Infinity, explanation: 'x' })).toBeNull();
  });

  it('truncates an over-long explanation to twelve words', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const clean = sanitizePrediction({ prediction: 'A', confidence: 0.6, explanation: long });
    expect(clean?.explanation.split(/\s+/).length).toBeLessThanOrEqual(13); // twelve words plus the ellipsis
    expect(clean?.explanation).toContain('…');
  });

  it('strips anything that could be read as markup', () => {
    const clean = sanitizePrediction({
      prediction: 'A',
      confidence: 0.6,
      explanation: '<img src=x onerror=alert(1)> stays put',
    });
    expect(clean?.explanation).not.toContain('<');
    expect(clean?.explanation).not.toContain('>');
  });

  it('has helpers that behave predictably in isolation', () => {
    expect(trimWords('a b c d', 2)).toBe('a b…');
    expect(trimWords('a b', 5)).toBe('a b');
    expect(scrub('  a <b>  c  ', 100)).toBe('a b c');
    expect(scrub('abcdef', 3)).toBe('abc');
  });
});

describe('sanitizeInterpretation and sanitizeDebrief', () => {
  it('keeps at most three traits and rejects an empty set', () => {
    const clean = sanitizeInterpretation({
      headline: 'Assessment complete.',
      observation: 'Two sentences here. And another.',
      traits: ['one', 'two', 'three', 'four'],
    });
    expect(clean?.traits).toHaveLength(3);
    expect(sanitizeInterpretation({ headline: 'h', observation: 'o', traits: [] })).toBeNull();
    expect(sanitizeInterpretation({ headline: 'h', observation: 'o' })).toBeNull();
  });

  it('clamps the fictional viability score into 1..99', () => {
    const high = sanitizeDebrief({
      tendencies: ['a'],
      paragraph: 'p',
      replacementViability: 250,
      finalObservation: 'o',
    });
    const low = sanitizeDebrief({
      tendencies: ['a'],
      paragraph: 'p',
      replacementViability: -40,
      finalObservation: 'o',
    });
    expect(high?.replacementViability).toBe(99);
    expect(low?.replacementViability).toBe(1);
  });

  it('rejects a debrief with no findings', () => {
    expect(
      sanitizeDebrief({ tendencies: [], paragraph: 'p', replacementViability: 50, finalObservation: 'o' }),
    ).toBeNull();
  });
});

describe('request validation', () => {
  it('accepts the summary the client actually produces', () => {
    expect(profileSummarySchema.safeParse(summary()).success).toBe(true);
  });

  it('rejects rates outside 0..1 and unknown fields', () => {
    expect(profileSummarySchema.safeParse({ ...summary(), winStay: 1.4 }).success).toBe(false);
    expect(profileSummarySchema.safeParse({ ...summary(), injected: 'x' }).success).toBe(false);
  });

  it('caps history at fifteen rounds', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => ({
      round: i + 1,
      choice: 'A' as const,
      win: true,
      ms: 500,
    }));
    expect(historySchema.safeParse(fifteen).success).toBe(true);
    expect(historySchema.safeParse([...fifteen, { round: 16, choice: 'A', win: true, ms: 1 }]).success).toBe(
      false,
    );
  });

  it('rejects a round number outside the game', () => {
    const base = { gameId: 'abcdefghij', profile: summary(), history: [] };
    expect(predictRequestSchema.safeParse({ ...base, round: 1 }).success).toBe(true);
    expect(predictRequestSchema.safeParse({ ...base, round: 0 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...base, round: 16 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...base, round: 1.5 }).success).toBe(false);
  });

  it('rejects a malformed game id', () => {
    const base = { round: 1, profile: summary(), history: [] };
    expect(predictRequestSchema.safeParse({ ...base, gameId: 'short' }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...base, gameId: 'has spaces!!' }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...base, gameId: 'a'.repeat(80) }).success).toBe(false);
  });

  it('bounds the reveal token length', () => {
    const base = { gameId: 'abcdefghij', round: 1, choice: 'A' as const };
    expect(revealRequestSchema.safeParse({ ...base, token: 'x'.repeat(40) }).success).toBe(true);
    expect(revealRequestSchema.safeParse({ ...base, token: 'short' }).success).toBe(false);
    expect(revealRequestSchema.safeParse({ ...base, token: 'x'.repeat(5000) }).success).toBe(false);
  });

  it('validates a complete debrief payload', () => {
    const payload = {
      gameId: 'abcdefghij',
      profile: summary(),
      history: history(),
      predictions: [{ round: 1, predicted: 'A' as const, correct: true }],
      accuracy: 0.5,
      drift: computeDrift(buildRounds('AABB', '1100')),
    };
    expect(debriefRequestSchema.safeParse(payload).success).toBe(true);
    expect(debriefRequestSchema.safeParse({ ...payload, accuracy: 2 }).success).toBe(false);
  });
});

describe('generatePrediction', () => {
  it('uses the deterministic stand-in when mock mode is on, and spends nothing', async () => {
    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: true,
    });
    expect(result.source).toBe('model');
    expect(result.fallbackReason).toBe('mock');
    expect(parse).not.toHaveBeenCalled();
    expect(['A', 'B']).toContain(result.data.prediction);
  });

  it('is deterministic in mock mode for the same game and round', async () => {
    const input = {
      gameId: 'game-abcdefgh',
      round: 4,
      profile: summary(),
      history: history(),
      authorized: true,
    };
    const first = await generatePrediction(input);
    const second = await generatePrediction(input);
    expect(first.data).toEqual(second.data);
  });

  it('does not call the model when mock mode is on even if unauthorised', async () => {
    const result = await generatePrediction({
      gameId: 'g-abcdefgh',
      round: 1,
      profile: summary(),
      history: [],
      authorized: false,
    });
    expect(parse).not.toHaveBeenCalled();
    expect(result.data.prediction).toMatch(/^[AB]$/);
  });

  it('sends the fixed model, low effort and a capped output budget', async () => {
    useRealModelPath();
    parse.mockResolvedValue({
      output_parsed: { prediction: 'B', confidence: 0.8, explanation: 'Leaves after a miss.' },
    });

    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: true,
    });

    expect(result.source).toBe('model');
    expect(result.data.prediction).toBe('B');
    const [body] = parse.mock.calls[0];
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.reasoning.effort).toBe('low');
    expect(body.max_output_tokens).toBe(OUTPUT_TOKENS.predict);
    expect(body.store).toBe(false);
  });

  it('never sends the hidden machine odds or any identifier', async () => {
    useRealModelPath();
    parse.mockResolvedValue({
      output_parsed: { prediction: 'A', confidence: 0.6, explanation: 'Stays put.' },
    });
    await generatePrediction({
      gameId: 'game-secret-id',
      round: 2,
      profile: summary(),
      history: history(),
      authorized: true,
    });
    const [body] = parse.mock.calls[0];
    const sent = JSON.stringify(body);
    expect(sent).not.toContain('game-secret-id');
    expect(sent).not.toContain('oddsA');
    expect(sent).not.toContain('probA');
    expect(sent.toLowerCase()).not.toContain('payout probability of machine');
    // The instructions must actively tell the model it does not have the odds.
    expect(body.instructions).toContain('NOT given the machines');
  });

  it('falls back to the local engine when the model returns nothing usable', async () => {
    useRealModelPath();
    parse.mockResolvedValue({ output_parsed: null });
    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: true,
    });
    expect(result.source).toBe('local');
    expect(result.fallbackReason).toBe('unusable_output');
    expect(['A', 'B']).toContain(result.data.prediction);
  });

  it('falls back when the model returns a malformed prediction', async () => {
    useRealModelPath();
    parse.mockResolvedValue({ output_parsed: { prediction: 'MAYBE', confidence: 2, explanation: 5 } });
    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: true,
    });
    expect(result.source).toBe('local');
  });

  it('falls back when the call throws, without surfacing the error', async () => {
    useRealModelPath();
    parse.mockRejectedValue(new Error('upstream exploded with sk-secret in the message'));
    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: true,
    });
    expect(result.source).toBe('local');
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });

  it('falls back when a quota refused the call, and never calls the model', async () => {
    useRealModelPath();
    const result = await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 3,
      profile: summary(),
      history: history(),
      authorized: false,
    });
    expect(result.source).toBe('local');
    expect(result.fallbackReason).toBe('not_authorized');
    expect(parse).not.toHaveBeenCalled();
  });
});

describe('generateInterpretation and generateDebrief', () => {
  it('produces a usable reading in mock mode', async () => {
    const result = await generateInterpretation({ profile: summary(), authorized: true });
    expect(result.data.traits).toHaveLength(3);
    expect(result.data.headline.length).toBeGreaterThan(0);
    expect(parse).not.toHaveBeenCalled();
  });

  it('falls back locally when the reading is unusable', async () => {
    useRealModelPath();
    parse.mockResolvedValue({ output_parsed: { headline: 'h', observation: 'o', traits: [] } });
    const result = await generateInterpretation({ profile: summary(), authorized: true });
    expect(result.source).toBe('local');
    expect(result.data.traits.length).toBeGreaterThan(0);
  });

  it('produces a debrief with a bounded fictional score', async () => {
    const result = await generateDebrief({
      profile: summary(),
      history: history(),
      predictions: [{ round: 1, predicted: 'A', correct: true }],
      accuracy: 0.5,
      drift: computeDrift(buildRounds('AABB', '1100')),
      authorized: true,
    });
    expect(result.data.replacementViability).toBeGreaterThanOrEqual(1);
    expect(result.data.replacementViability).toBeLessThanOrEqual(99);
    expect(result.data.tendencies.length).toBeGreaterThan(0);
  });

  it('never makes a diagnostic claim in its instructions', async () => {
    useRealModelPath();
    parse.mockResolvedValue({
      output_parsed: {
        tendencies: ['a', 'b', 'c'],
        paragraph: 'p',
        replacementViability: 55,
        finalObservation: 'o',
      },
    });
    await generateDebrief({
      profile: summary(),
      history: history(),
      predictions: [],
      accuracy: 0.5,
      drift: computeDrift(buildRounds('AABB', '1100')),
      authorized: true,
    });
    const [body] = parse.mock.calls[0];
    expect(body.instructions).toContain('Never make medical, psychiatric, clinical or diagnostic claims');
  });
});

describe('local narrative engine', () => {
  it('produces the same prediction shape as the model', () => {
    const result = localPrediction({
      profile: summary(),
      history: history(),
      round: 3,
      gameId: 'game-abcdefgh',
    });
    expect(['A', 'B']).toContain(result.prediction);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
    expect(result.explanation.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it('varies its prediction across rounds rather than answering A every time', () => {
    const seen = new Set<string>();
    for (let round = 1; round <= 15; round += 1) {
      seen.add(
        localPrediction({ profile: summary(), history: [], round, gameId: `game-${round}` }).prediction,
      );
    }
    expect(seen.size).toBe(2);
  });

  it('writes an interpretation grounded in the trial count', () => {
    const profile = summary();
    const reading = localInterpretation(profile);
    expect(reading.observation).toContain(String(profile.trials));
    expect(reading.traits).toHaveLength(3);
  });

  it('writes a debrief that reports the real accuracy', () => {
    const report = localDebrief({
      profile: summary(),
      accuracy: 0.6,
      drift: computeDrift(buildRounds('AABB', '1100')),
      rounds: 15,
    });
    expect(report.paragraph).toContain('60%');
    expect(report.paragraph).toContain('15');
  });
});

describe('computeDrift', () => {
  it('splits the game in half and reports both halves', () => {
    const drift = computeDrift(buildRounds('AAAABBBB', '11110000', 'AAAABBBB'));
    expect(drift.firstHalfAccuracy).toBe(1);
    expect(drift.secondHalfAccuracy).toBe(1);
    expect(drift.meanMsFirstHalf).toBeGreaterThan(0);
  });

  it('detects a rise in switching between halves', () => {
    const drift = computeDrift(buildRounds('AAAAABAB', '11111111'));
    expect(drift.secondHalfSwitchRate).toBeGreaterThan(drift.firstHalfSwitchRate);
  });

  it('survives an empty game', () => {
    const drift = computeDrift([]);
    expect(drift.firstHalfAccuracy).toBe(0);
    expect(Number.isFinite(drift.firstHalfSwitchRate)).toBe(true);
  });
});

describe('hydrateProfile', () => {
  it('round-trips a summary into a usable profile', () => {
    const original = summary();
    const hydrated = hydrateProfile(original);
    expect(hydrated.winStayRate.value).toBe(original.winStay);
    expect(hydrated.leftBias.value).toBe(original.sideBias);
    expect(hydrated.meanDecisionMs).toBe(original.meanMs);
    expect(hydrated.trials).toBe(original.trials);
  });

  it('gives every trait the single evidence figure the summary carries', () => {
    const original = summary();
    const hydrated = hydrateProfile(original);
    expect(hydrated.winStayRate.confidence).toBe(original.evidence);
    expect(hydrated.riskRate.confidence).toBe(original.evidence);
  });
});

describe('seedFrom', () => {
  it('is stable and order-sensitive', () => {
    expect(seedFrom('a', 1)).toBe(seedFrom('a', 1));
    expect(seedFrom('a', 1)).not.toBe(seedFrom('a', 2));
    expect(seedFrom('a', 'b')).not.toBe(seedFrom('b', 'a'));
    expect(seedFrom('x')).toBeGreaterThanOrEqual(0);
  });
});
