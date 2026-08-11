/**
 * The three model calls, and what happens when they do not work.
 *
 * Exactly one shape of failure exists as far as the game is concerned: no usable
 * structured output. Refused by a quota, no key configured, network error,
 * timeout, malformed JSON, a `null` parse — all of them land in the same place,
 * the local narrative engine, and the player never sees a technical error.
 *
 * Call budget per complete game: 1 interpretation + at most 15 predictions +
 * 1 debrief = 17. Reveal never calls the model.
 */

import 'server-only';
import { zodTextFormat } from 'openai/helpers/zod';
import type { PredictionSource, Side } from '@/types';
import {
  computeDrift,
  localDebrief,
  localInterpretation,
  localPrediction,
  type CompactRound,
  type DriftInput,
} from '@/lib/behavior/narrative';
import type { ProfileSummary } from '@/lib/behavior/profile';
import { mockAiEnabled } from '@/lib/security/env';
import { logQuietly, withTimeout } from '@/lib/security/http';
import { MODEL, OUTPUT_TOKENS, REASONING_EFFORT, TIMEOUT_MS, getOpenAI } from './client';
import {
  DEBRIEF_INSTRUCTIONS,
  INTERPRET_INSTRUCTIONS,
  PREDICT_INSTRUCTIONS,
  buildDebriefInput,
  buildInterpretInput,
  buildPredictInput,
} from './prompts';
import {
  debriefOutputSchema,
  interpretOutputSchema,
  predictionOutputSchema,
  sanitizeDebrief,
  sanitizeInterpretation,
  sanitizePrediction,
} from './schemas';

export { computeDrift };
export type { DriftInput };

export interface AiOutcome<T> {
  data: T;
  source: PredictionSource;
  /** Internal only. Explains a fallback for debugging and tests; never rendered. */
  fallbackReason?: string;
}

export interface PredictionResult {
  prediction: Side;
  confidence: number;
  reasoning: string;
}

/**
 * Run a structured call, or return null for every failure mode.
 *
 * `withTimeout` collapses slow into unavailable; the try/catch collapses network
 * and API errors into the same. Nothing from the exception is propagated —
 * upstream messages can echo request contents and must not reach a client.
 */
async function runStructured<T>(
  scope: string,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T | null>,
): Promise<T | null> {
  const result = await withTimeout(async (signal) => {
    try {
      return await work(signal);
    } catch {
      logQuietly(scope, 'upstream_failed');
      return null;
    }
  }, timeoutMs);
  return result ?? null;
}

// ---------------------------------------------------------------------------
// 1. Calibration interpretation — one call per game.
// ---------------------------------------------------------------------------

export async function generateInterpretation(input: {
  profile: ProfileSummary;
  authorized: boolean;
}): Promise<AiOutcome<{ headline: string; observation: string; traits: string[] }>> {
  const local = () => localInterpretation(input.profile);

  // Mock mode is checked before authorization on purpose: it spends nothing, so
  // the paid-call quotas have no bearing on whether it may run.
  if (mockAiEnabled()) return { data: local(), source: 'model', fallbackReason: 'mock' };
  if (!input.authorized) return { data: local(), source: 'local', fallbackReason: 'not_authorized' };

  const client = getOpenAI();
  if (!client) return { data: local(), source: 'local', fallbackReason: 'no_client' };

  const parsed = await runStructured('interpret', TIMEOUT_MS.interpret, async (signal) => {
    const response = await client.responses.parse(
      {
        model: MODEL,
        instructions: INTERPRET_INSTRUCTIONS,
        input: buildInterpretInput(input.profile),
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: OUTPUT_TOKENS.interpret,
        store: false,
        text: { format: zodTextFormat(interpretOutputSchema, 'interpretation'), verbosity: 'low' },
      },
      { signal },
    );
    return response.output_parsed;
  });

  const clean = sanitizeInterpretation(parsed);
  if (!clean) return { data: local(), source: 'local', fallbackReason: 'unusable_output' };
  return { data: clean, source: 'model' };
}

// ---------------------------------------------------------------------------
// 2. Round prediction — at most fifteen calls per game.
// ---------------------------------------------------------------------------

export async function generatePrediction(input: {
  gameId: string;
  round: number;
  profile: ProfileSummary;
  history: readonly CompactRound[];
  authorized: boolean;
}): Promise<AiOutcome<PredictionResult>> {
  const local = (): PredictionResult => {
    const narrative = localPrediction({
      profile: input.profile,
      history: input.history,
      round: input.round,
      gameId: input.gameId,
    });
    return {
      prediction: narrative.prediction,
      confidence: narrative.confidence,
      reasoning: narrative.explanation,
    };
  };

  // Mock mode is checked before authorization on purpose: it spends nothing, so
  // the paid-call quotas have no bearing on whether it may run.
  if (mockAiEnabled()) return { data: local(), source: 'model', fallbackReason: 'mock' };
  if (!input.authorized) return { data: local(), source: 'local', fallbackReason: 'not_authorized' };

  const client = getOpenAI();
  if (!client) return { data: local(), source: 'local', fallbackReason: 'no_client' };

  const parsed = await runStructured('predict', TIMEOUT_MS.predict, async (signal) => {
    const response = await client.responses.parse(
      {
        model: MODEL,
        instructions: PREDICT_INSTRUCTIONS,
        input: buildPredictInput({
          round: input.round,
          profile: input.profile,
          history: input.history.map((h) => ({ ...h })),
        }),
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: OUTPUT_TOKENS.predict,
        store: false,
        text: { format: zodTextFormat(predictionOutputSchema, 'prediction'), verbosity: 'low' },
      },
      { signal },
    );
    return response.output_parsed;
  });

  const clean = sanitizePrediction(parsed);
  if (!clean) return { data: local(), source: 'local', fallbackReason: 'unusable_output' };
  return {
    data: { prediction: clean.prediction, confidence: clean.confidence, reasoning: clean.explanation },
    source: 'model',
  };
}

// ---------------------------------------------------------------------------
// 3. Debrief — one call per game.
// ---------------------------------------------------------------------------

export interface DebriefResult {
  tendencies: string[];
  paragraph: string;
  replacementViability: number;
  finalObservation: string;
}

export async function generateDebrief(input: {
  profile: ProfileSummary;
  history: readonly CompactRound[];
  predictions: ReadonlyArray<{ round: number; predicted: Side; correct: boolean }>;
  accuracy: number;
  drift: DriftInput;
  authorized: boolean;
}): Promise<AiOutcome<DebriefResult>> {
  const local = (): DebriefResult =>
    localDebrief({
      profile: input.profile,
      accuracy: input.accuracy,
      drift: input.drift,
      rounds: input.history.length,
    });

  // Mock mode is checked before authorization on purpose: it spends nothing, so
  // the paid-call quotas have no bearing on whether it may run.
  if (mockAiEnabled()) return { data: local(), source: 'model', fallbackReason: 'mock' };
  if (!input.authorized) return { data: local(), source: 'local', fallbackReason: 'not_authorized' };

  const client = getOpenAI();
  if (!client) return { data: local(), source: 'local', fallbackReason: 'no_client' };

  const parsed = await runStructured('debrief', TIMEOUT_MS.debrief, async (signal) => {
    const response = await client.responses.parse(
      {
        model: MODEL,
        instructions: DEBRIEF_INSTRUCTIONS,
        input: buildDebriefInput({
          profile: input.profile,
          history: input.history.map((h) => ({ ...h })),
          predictions: input.predictions,
          accuracy: input.accuracy,
          drift: input.drift,
        }),
        reasoning: { effort: REASONING_EFFORT },
        max_output_tokens: OUTPUT_TOKENS.debrief,
        store: false,
        text: { format: zodTextFormat(debriefOutputSchema, 'debrief'), verbosity: 'low' },
      },
      { signal },
    );
    return response.output_parsed;
  });

  const clean = sanitizeDebrief(parsed);
  if (!clean) return { data: local(), source: 'local', fallbackReason: 'unusable_output' };
  return { data: clean, source: 'model' };
}
