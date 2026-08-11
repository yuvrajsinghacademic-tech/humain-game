/**
 * The local narrative engine.
 *
 * Everything the model says, this module can also say — from the same numbers,
 * deterministically, with no network and no cost. It has three jobs:
 *
 *  1. It is the deterministic stand-in model used when `MOCK_AI=true` or no key
 *     is configured, so the whole game (and the whole end-to-end test) runs with
 *     no secrets.
 *  2. It is the fallback whenever a real call fails, times out, is refused by a
 *     quota, or returns something unusable.
 *  3. It is the browser's last resort if the API itself is unreachable, which is
 *     why it lives here in pure-domain code rather than behind `server-only`.
 *
 * The only difference between those three uses is the `source` the caller
 * reports. The words are honestly derived either way.
 */

import type { RoundRecord, Side } from '@/types';
import { hydrateProfile, seedFrom } from './hydrate';
import type { ProfileSummary } from './profile';
import { describeDominantTraits, predictLocally } from './predictor';
import { mulberry32 } from './rng';

/** Compact prior round, matching the wire shape. */
export interface CompactRound {
  round: number;
  choice: Side;
  win: boolean;
  ms: number;
}

export interface DriftInput {
  firstHalfSwitchRate: number;
  secondHalfSwitchRate: number;
  firstHalfAccuracy: number;
  secondHalfAccuracy: number;
  meanMsFirstHalf: number;
  meanMsSecondHalf: number;
}

export interface PredictionNarrative {
  prediction: Side;
  confidence: number;
  explanation: string;
  weakEvidence: boolean;
}

const EXPLANATIONS = [
  'Holds the lever that has just paid out.',
  'Leaves any lever the instant it disappoints.',
  'Alternates on a short, readable cycle.',
  'Still sampling despite a clear answer.',
  'Positional habit outweighs the payouts here.',
  'Weighs the last result above everything earlier.',
  'A long run of identical pulls tends to continue.',
  'Hesitation before switching suggests they stay.',
];

function toRounds(history: readonly CompactRound[]): RoundRecord[] {
  return history.map((h) => ({
    round: h.round,
    choice: h.choice,
    win: h.win,
    responseMs: h.ms,
    // Only choice, outcome and latency feed the predictor; these two are inert.
    predicted: h.choice,
    correct: false,
    confidence: 0.5,
    predictionSource: 'model' as const,
  }));
}

/**
 * A prediction in the same shape the model returns.
 *
 * Seeded from the game id and round so a given game replays identically, which
 * is what lets the end-to-end test assert on specific rounds.
 */
export function localPrediction(input: {
  profile: ProfileSummary;
  history: readonly CompactRound[];
  round: number;
  gameId: string;
}): PredictionNarrative {
  const seed = seedFrom(input.gameId, input.round, input.history.length);
  const local = predictLocally({
    profile: hydrateProfile(input.profile),
    history: toRounds(input.history),
    round: input.round,
    rng: mulberry32(seed),
  });

  return {
    prediction: local.prediction,
    confidence: local.weakEvidence ? 0.52 : Math.min(0.95, local.confidence),
    explanation: local.weakEvidence
      ? 'Too little signal yet; leaning on positional habit.'
      : EXPLANATIONS[seed % EXPLANATIONS.length],
    weakEvidence: local.weakEvidence,
  };
}

export function localInterpretation(profile: ProfileSummary): {
  headline: string;
  observation: string;
  traits: string[];
} {
  const traits = describeDominantTraits(hydrateProfile(profile));
  const seed = seedFrom(profile.trials, profile.consistency, profile.sideBias);
  const headlines = [
    'Darry has finished looking.',
    'Darry finds you compressible.',
    'Darry finds your preferences stable.',
    'Darry has recorded you.',
  ];
  const tempo = profile.meanMs < 800 ? 'decisive' : profile.meanMs < 1600 ? 'measured' : 'deliberate';
  const hesitation =
    profile.hesitationMs > 120
      ? 'You take longer to leave a choice than to keep one.'
      : profile.hesitationMs < -120
        ? 'You leave a choice faster than you keep one.'
        : 'Your timing does not change when you change your mind.';

  return {
    headline: headlines[seed % headlines.length],
    observation: `${profile.trials} trials were sufficient. Your responses are ${tempo} and ${
      profile.consistency > 0.5 ? 'fit a single rule' : 'resist a single rule'
    }. ${hesitation}`,
    traits,
  };
}

export function localDebrief(input: {
  profile: ProfileSummary;
  accuracy: number;
  drift: DriftInput;
  rounds: number;
}): {
  tendencies: string[];
  paragraph: string;
  replacementViability: number;
  finalObservation: string;
} {
  const tendencies = describeDominantTraits(hydrateProfile(input.profile));
  const readable = input.drift.secondHalfAccuracy - input.drift.firstHalfAccuracy;

  // Fictional score: how compressible this person's behaviour turned out to be.
  // Weighted toward measured consistency, then how well the machine tracked them,
  // discounted when there was not much evidence to go on.
  const viability = Math.round(
    Math.min(
      97,
      Math.max(
        8,
        100 * (0.45 * input.profile.consistency + 0.4 * input.accuracy + 0.15 * input.profile.evidence),
      ),
    ),
  );

  const direction =
    readable > 0.12
      ? 'You became easier to anticipate as you went.'
      : readable < -0.12
        ? 'You became harder to anticipate as you went.'
        : 'Your readability held steady from the first round to the last.';

  /*
   * The closing line has to agree with the score. Selecting it purely by hash once
   * produced "your unpredictability was itself a stable quantity" over a 73% read,
   * which is a contradiction the player can see. So the bucket is chosen by the
   * actual accuracy and the seed only picks within it.
   */
  const seed = seedFrom(input.accuracy, input.profile.consistency, input.rounds);
  const closers =
    input.accuracy >= 0.7
      ? [
          'Nothing you did was unavailable to Darry.',
          'Darry saw it before you knew you were doing it.',
        ]
      : input.accuracy >= 0.5
        ? [
            'Darry needed fewer numbers to describe you than you would like.',
            'Darry is most of the way to you already.',
          ]
        : [
            'Your unpredictability was itself a stable quantity.',
            'Darry has not finished with you.',
          ];

  return {
    tendencies,
    paragraph: `You pulled ${input.rounds} times and Darry read you ${Math.round(
      input.accuracy * 100,
    )}% of the time. ${direction} Your switching rate moved from ${Math.round(
      input.drift.firstHalfSwitchRate * 100,
    )}% to ${Math.round(
      input.drift.secondHalfSwitchRate * 100,
    )}% across the game. What you call a decision, Darry calls a habit.`,
    replacementViability: viability,
    finalObservation: closers[seed % closers.length],
  };
}

/** Compute the drift figures the debrief needs from a finished game. */
export function computeDrift(rounds: readonly RoundRecord[]): DriftInput {
  const half = Math.max(1, Math.floor(rounds.length / 2));
  const first = rounds.slice(0, half);
  const second = rounds.slice(rounds.length - half);

  const switchRate = (slice: readonly RoundRecord[], offset: number): number => {
    let switches = 0;
    let comparisons = 0;
    for (let i = 0; i < slice.length; i += 1) {
      const previous = offset + i - 1 >= 0 ? rounds[offset + i - 1] : undefined;
      if (!previous) continue;
      comparisons += 1;
      if (previous.choice !== slice[i].choice) switches += 1;
    }
    return comparisons === 0 ? 0.5 : switches / comparisons;
  };

  const acc = (slice: readonly RoundRecord[]): number =>
    slice.length === 0 ? 0 : slice.filter((r) => r.correct).length / slice.length;
  const ms = (slice: readonly RoundRecord[]): number =>
    slice.length === 0 ? 0 : Math.round(slice.reduce((a, r) => a + r.responseMs, 0) / slice.length);

  return {
    firstHalfSwitchRate: switchRate(first, 0),
    secondHalfSwitchRate: switchRate(second, rounds.length - half),
    firstHalfAccuracy: acc(first),
    secondHalfAccuracy: acc(second),
    meanMsFirstHalf: ms(first),
    meanMsSecondHalf: ms(second),
  };
}
