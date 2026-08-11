/**
 * Rebuild a usable profile from the compact summary.
 *
 * The server only ever receives `ProfileSummary` — rounded rates plus one
 * aggregate evidence figure — because that is all it needs and all the player
 * should have to hand over. When the server has to run the local engine (as a
 * fallback, or as the deterministic stand-in model), it hydrates that summary
 * back into the profile shape the predictor expects.
 *
 * The hydrated profile is intentionally coarser than the browser's: per-trait
 * sample sizes are gone, so every trait inherits the single evidence figure.
 * That makes server-side local predictions slightly less sharp than the
 * client's, which is the correct trade for sending less data.
 */

import { PROFILE_VERSION, type BehaviorProfile, type TraitEstimate } from '@/types';
import type { ProfileSummary } from './profile';

export function hydrateProfile(summary: ProfileSummary): BehaviorProfile {
  const trait = (value: number): TraitEstimate => ({
    value,
    // Approximate: total trials spread across the nine rate traits.
    n: Math.round((summary.trials / 9) * summary.evidence),
    confidence: summary.evidence,
  });

  return {
    version: PROFILE_VERSION,
    winStayRate: trait(summary.winStay),
    loseSwitchRate: trait(summary.loseSwitch),
    alternationRate: trait(summary.alternation),
    explorationRate: trait(summary.exploration),
    riskRate: trait(summary.risk),
    leftBias: trait(summary.sideBias),
    recencyWeight: trait(summary.recency),
    reactanceRate: trait(summary.reactance),
    consistencyScore: trait(summary.consistency),
    winStreakStay: trait(summary.winStreakStay),
    lossStreakSwitch: trait(summary.lossStreakSwitch),
    meanDecisionMs: summary.meanMs,
    switchDecisionMs: summary.switchMs,
    repeatDecisionMs: summary.repeatMs,
    hesitationDeltaMs: summary.hesitationMs,
    trials: summary.trials,
  };
}

/**
 * Stable 32-bit hash. Used to seed deterministic randomness from a game id and
 * round so the mock model and the fallback engine are reproducible in tests.
 */
export function seedFrom(...parts: Array<string | number>): number {
  const input = parts.join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
