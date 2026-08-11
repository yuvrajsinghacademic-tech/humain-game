/**
 * Act II scoring. Documented constants, pure arithmetic.
 */

import type { RoundRecord, Side } from '@/types';

/** Coins paid by a machine that lands. A miss pays nothing. */
export const REWARD_COINS = 10;

/** Rounds in one complete game. */
export const TOTAL_ROUNDS = 15;

/** Inclusive bounds for the generous machine's hidden payout probability. */
export const HIGH_ODDS_RANGE = [0.62, 0.82] as const;
/** Inclusive bounds for the stingy machine's hidden payout probability. */
export const LOW_ODDS_RANGE = [0.15, 0.35] as const;

export function coinsFrom(rounds: readonly RoundRecord[]): number {
  return rounds.filter((r) => r.win).length * REWARD_COINS;
}

export function correctCount(rounds: readonly RoundRecord[]): number {
  return rounds.filter((r) => r.correct).length;
}

/** AI accuracy as a 0..1 fraction. Zero rounds returns 0. */
export function accuracy(rounds: readonly RoundRecord[]): number {
  if (rounds.length === 0) return 0;
  return correctCount(rounds) / rounds.length;
}

export function accuracyPercent(rounds: readonly RoundRecord[]): number {
  return Math.round(accuracy(rounds) * 100);
}

/**
 * Did the player get easier to read as the game went on?
 *
 * Second-half accuracy minus first-half accuracy. Positive means the machine
 * closed on them. With an odd round count the middle round is left out of both
 * halves so neither is weighted by it.
 */
export function predictabilityDrift(rounds: readonly RoundRecord[]): number {
  if (rounds.length < 4) return 0;
  const half = Math.floor(rounds.length / 2);
  const first = rounds.slice(0, half);
  const second = rounds.slice(rounds.length - half);
  return accuracy(second) - accuracy(first);
}

/** Which machine was objectively the better bet. */
export function betterMachine(oddsA: number, oddsB: number): Side {
  return oddsA >= oddsB ? 'A' : 'B';
}

/** How often the player actually pulled the better machine, 0..1. */
export function optimalChoiceRate(rounds: readonly RoundRecord[], better: Side): number {
  if (rounds.length === 0) return 0;
  return rounds.filter((r) => r.choice === better).length / rounds.length;
}
