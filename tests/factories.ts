/**
 * Test builders.
 *
 * The behavioural maths is only meaningful on realistic trial sequences, so these
 * helpers construct records the way the game does — through `annotateTrial`, so
 * repeat/switch and prior-outcome fields are derived exactly as they are at
 * runtime rather than hand-set to whatever a test wants them to be.
 */

import { annotateTrial, type RawTrialCapture } from '@/lib/behavior/profile';
import type { RoundRecord, Side, TrialCategory, TrialRecord } from '@/types';

export interface TrialSpec {
  block?: string;
  category?: TrialCategory;
  option: 'one' | 'two';
  position?: 'left' | 'right';
  rewarded?: boolean | null;
  responseMs?: number;
  timedOut?: boolean;
  afterNotice?: boolean;
  risky?: boolean | null;
}

/** Build an annotated trial sequence from a compact description. */
export function buildTrials(specs: readonly TrialSpec[]): TrialRecord[] {
  const out: TrialRecord[] = [];
  specs.forEach((spec, index) => {
    const block = spec.block ?? 'chan-a';
    const raw: RawTrialCapture = {
      trialId: `${block}-${index}`,
      index,
      category: spec.category ?? 'bandit',
      block,
      optionOrder: [`${block}:one`, `${block}:two`],
      chosenOptionId: `${block}:${spec.option}`,
      chosenPosition: spec.position ?? (spec.option === 'one' ? 'left' : 'right'),
      responseMs: spec.responseMs ?? 900,
      timedOut: spec.timedOut ?? false,
      rewarded: spec.rewarded ?? null,
      afterPatternNotice: spec.afterNotice ?? false,
      riskyChosen: spec.risky ?? null,
    };
    out.push(annotateTrial(out, raw));
  });
  return out;
}

/** Build Act II rounds. `pattern` is a string of A/B, `wins` a string of 1/0. */
export function buildRounds(pattern: string, wins: string, predicted?: string): RoundRecord[] {
  return pattern.split('').map((letter, index) => {
    const choice = letter.toUpperCase() as Side;
    const predictedSide = (predicted?.[index]?.toUpperCase() ?? letter.toUpperCase()) as Side;
    return {
      round: index + 1,
      choice,
      win: wins[index] === '1',
      responseMs: 800 + index * 10,
      predicted: predictedSide,
      correct: predictedSide === choice,
      confidence: 0.6,
      predictionSource: 'model' as const,
    };
  });
}
