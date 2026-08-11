/**
 * The closing verdict copy.
 *
 * Pure and testable, because the numbers on this screen are the one thing in the
 * game that must not be theatre. Darry's percentage is its real accuracy over the
 * fifteen rounds and the player's is exactly the remainder — no curve, no floor,
 * no flattering rounding.
 *
 * The fictional verdict is always "You will be replaced." That is the piece's
 * ending, not a claim about the score. When Darry actually did badly, the copy
 * underneath says so: it needs more observations. It never asserts it already won.
 */

import type { DebriefReport, RoundRecord } from '@/types';
import { accuracyPercent, correctCount, predictabilityDrift } from './scoring';

/** Above this, Darry has a genuine read and the copy may say so. */
export const STRONG_READ = 60;

export interface EndingNumbers {
  darry: number;
  you: number;
  correct: number;
  rounds: number;
}

export function endingNumbers(rounds: readonly RoundRecord[]): EndingNumbers {
  const darry = accuracyPercent(rounds);
  return {
    darry,
    // Exactly the remainder. The two figures always total 100.
    you: 100 - darry,
    correct: correctCount(rounds),
    rounds: rounds.length,
  };
}

/** Hard ceiling on the closing description. Two short sentences, no essay. */
export const MAX_ENDING_CHARS = 190;

/**
 * Two sentences at most, built from real figures.
 *
 * Darry's own closing observation is used when it is short enough to belong on
 * this screen; otherwise the line is composed locally from the same data. Either
 * way the claim matches the score.
 */
export function endingCopy(
  rounds: readonly RoundRecord[],
  report: DebriefReport | null,
): string {
  const { darry, correct, rounds: played } = endingNumbers(rounds);

  if (darry < 50) {
    // Darry lost. It does not get to pretend otherwise.
    return `Darry has not finished learning you. It only needs more questions.`;
  }

  const drift = predictabilityDrift(rounds);
  const second =
    drift > 0.08
      ? 'Your pattern became easier to read as the game continued.'
      : drift < -0.08
        ? 'You grew harder to read as the game continued, but not fast enough.'
        : 'Your pattern held steady from the first round to the last.';

  const first = `Darry predicted ${correct} of your ${played} choices.`;
  const composed = `${first} ${second}`;

  // Prefer Darry's own words when they fit, so a real model response is not wasted.
  const offered = report?.finalObservation?.trim();
  if (offered && offered.length > 0) {
    const candidate = `${first} ${ensureStop(offered)}`;
    if (candidate.length <= MAX_ENDING_CHARS) return candidate;
  }

  return composed.length <= MAX_ENDING_CHARS ? composed : first;
}

function ensureStop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
