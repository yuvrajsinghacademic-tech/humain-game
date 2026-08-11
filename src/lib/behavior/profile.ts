/**
 * Behavioral profile derivation.
 *
 * Pure functions over recorded trials. No React, no network, no randomness —
 * given the same records this always produces the same profile, which is what
 * makes the whole thing testable and makes the claims the game later makes
 * about the player auditable rather than theatrical.
 *
 * Every rate is smoothed toward an even prior so that three trials cannot
 * produce a "you are 100% predictable" claim. Each estimate carries the raw
 * observation count and a sample-size confidence alongside its value.
 */

import {
  PROFILE_VERSION,
  type BehaviorProfile,
  type ChoiceRelation,
  type PriorOutcome,
  type RoundRecord,
  type TraitEstimate,
  type TrialRecord,
} from '@/types';

/** Pseudo-count added to every rate, split across the prior. Four is ~2 trials of pull. */
const SMOOTHING_ALPHA = 4;
/** Neutral prior for every rate in the profile. */
const NEUTRAL_PRIOR = 0.5;
/** Half-confidence point: n === CONFIDENCE_K gives confidence 0.5. */
const CONFIDENCE_K = 8;
/** Fallback latency when a subset has no observations at all. */
const DEFAULT_DECISION_MS = 900;

/** Trial families that carry a channel reward signal and so inform bandit traits. */
const CHANNEL_CATEGORIES = new Set(['bandit', 'reactance']);

/** Smooth a success count into a rate, plus its sample-size confidence. */
export function estimate(successes: number, n: number, prior = NEUTRAL_PRIOR): TraitEstimate {
  const value = (successes + SMOOTHING_ALPHA * prior) / (n + SMOOTHING_ALPHA);
  return { value: clamp01(value), n, confidence: n / (n + CONFIDENCE_K) };
}

/** Smooth an already-computed rate (used where the statistic isn't a count). */
export function estimateFromRate(rate: number, n: number, prior = NEUTRAL_PRIOR): TraitEstimate {
  return estimate(rate * n, n, prior);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return NEUTRAL_PRIOR;
  return Math.min(1, Math.max(0, value));
}

/** Raw capture from the UI, before sequence-dependent fields are filled in. */
export interface RawTrialCapture {
  trialId: string;
  index: number;
  category: TrialRecord['category'];
  block: string;
  optionOrder: [string, string];
  chosenOptionId: string;
  chosenPosition: TrialRecord['chosenPosition'];
  responseMs: number;
  timedOut: boolean;
  rewarded: boolean | null;
  afterPatternNotice: boolean;
  riskyChosen: boolean | null;
}

/**
 * Fill in the fields that only make sense relative to earlier trials.
 *
 * Kept here rather than in the component so there is exactly one definition of
 * "repeated", "previous outcome" and "streak", and so it can be unit-tested.
 */
export function annotateTrial(prior: readonly TrialRecord[], raw: RawTrialCapture): TrialRecord {
  const sameBlock = prior.filter((r) => r.block === raw.block);
  const previous = sameBlock[sameBlock.length - 1];

  let relation: ChoiceRelation = 'none';
  if (previous) relation = previous.chosenOptionId === raw.chosenOptionId ? 'repeat' : 'switch';

  const rewardedHistory = sameBlock.filter((r) => r.rewarded !== null);
  const lastRewarded = rewardedHistory[rewardedHistory.length - 1];
  let priorOutcome: PriorOutcome = 'none';
  if (lastRewarded) priorOutcome = lastRewarded.rewarded ? 'win' : 'loss';

  let priorOutcomeStreak = 0;
  for (let i = rewardedHistory.length - 1; i >= 0; i -= 1) {
    if (rewardedHistory[i].rewarded === lastRewarded?.rewarded) priorOutcomeStreak += 1;
    else break;
  }

  return { ...raw, relation, priorOutcome, priorOutcomeStreak };
}

interface Tally {
  successes: number;
  n: number;
}

const tally = (): Tally => ({ successes: 0, n: 0 });
const add = (t: Tally, hit: boolean) => {
  t.n += 1;
  if (hit) t.successes += 1;
};

/**
 * Derive the full profile from a trial sequence.
 *
 * Accepts calibration trials, Act II rounds converted by `roundsToTrialRecords`,
 * or both concatenated — the booth is just another channel block.
 */
export function deriveProfile(records: readonly TrialRecord[]): BehaviorProfile {
  const ordered = records.slice().sort((a, b) => a.index - b.index);

  const winStay = tally();
  const loseSwitch = tally();
  const alternation = tally();
  const exploration = tally();
  const risk = tally();
  const left = tally();
  const recency = tally();
  const winStreakStay = tally();
  const lossStreakSwitch = tally();

  // Reactance is a contrast, so the two halves are tallied separately.
  const switchBefore = tally();
  const switchAfter = tally();

  // Consistency: in-sample hit rate of the best single naive heuristic.
  const heuristics = {
    repeat: tally(),
    alternate: tally(),
    winStayLoseShift: tally(),
    left: tally(),
    right: tally(),
  };

  const latencies: number[] = [];
  const switchLatencies: number[] = [];
  const repeatLatencies: number[] = [];

  /** Per-block running record of each option's observed payout rate. */
  const observed = new Map<string, Map<string, Tally>>();
  const optionSeen = new Map<string, string[]>();

  for (const record of ordered) {
    const isChannel = CHANNEL_CATEGORIES.has(record.category);

    if (record.timedOut) {
      // A trial that ran out of time carries no intent, so it informs nothing —
      // not latency, not position, not repeat/switch. It is recorded for the log
      // and skipped here.
      continue;
    }

    latencies.push(record.responseMs);
    if (record.relation === 'switch') switchLatencies.push(record.responseMs);
    if (record.relation === 'repeat') repeatLatencies.push(record.responseMs);

    // Position bias. Counterbalanced display means 0.5 is genuinely unbiased.
    add(left, record.chosenPosition === 'left');

    if (record.riskyChosen !== null) add(risk, record.riskyChosen);

    if (record.relation !== 'none') {
      add(alternation, record.relation === 'switch');
      add(heuristics.repeat, record.relation === 'repeat');
      add(heuristics.alternate, record.relation === 'switch');
    }
    add(heuristics.left, record.chosenPosition === 'left');
    add(heuristics.right, record.chosenPosition === 'right');

    if (isChannel && record.relation !== 'none') {
      if (record.priorOutcome === 'win') {
        add(winStay, record.relation === 'repeat');
        add(heuristics.winStayLoseShift, record.relation === 'repeat');
        if (record.priorOutcomeStreak >= 2) add(winStreakStay, record.relation === 'repeat');
      } else if (record.priorOutcome === 'loss') {
        add(loseSwitch, record.relation === 'switch');
        add(heuristics.winStayLoseShift, record.relation === 'switch');
        if (record.priorOutcomeStreak >= 2) add(lossStreakSwitch, record.relation === 'switch');
      }

      if (record.afterPatternNotice) add(switchAfter, record.relation === 'switch');
      else add(switchBefore, record.relation === 'switch');
    }

    if (isChannel) {
      const blockObserved = observed.get(record.block) ?? new Map<string, Tally>();
      const seen = optionSeen.get(record.block) ?? [];

      // --- Exploration: did they take the option that looked worse so far? ---
      const [idA, idB] = record.optionOrder;
      const meanA = rateOf(blockObserved.get(idA));
      const meanB = rateOf(blockObserved.get(idB));
      const bothSampled = (blockObserved.get(idA)?.n ?? 0) > 0 && (blockObserved.get(idB)?.n ?? 0) > 0;
      if (bothSampled && meanA !== meanB) {
        const greedy = meanA > meanB ? idA : idB;
        add(exploration, record.chosenOptionId !== greedy);

        // --- Recency: when "follow the last result" disagrees with "follow the
        // whole record", which one did they obey? Only those trials are informative.
        const previousChannel = seen[seen.length - 1];
        if (previousChannel && record.priorOutcome !== 'none') {
          const lastHeuristicPick =
            record.priorOutcome === 'win'
              ? previousChannel
              : previousChannel === idA
                ? idB
                : idA;
          if (lastHeuristicPick !== greedy) {
            add(recency, record.chosenOptionId === lastHeuristicPick);
          }
        }
      }

      if (record.rewarded !== null) {
        const t = blockObserved.get(record.chosenOptionId) ?? tally();
        add(t, record.rewarded);
        blockObserved.set(record.chosenOptionId, t);
      }
      seen.push(record.chosenOptionId);
      observed.set(record.block, blockObserved);
      optionSeen.set(record.block, seen);
    }
  }

  const bestHeuristic = Object.values(heuristics).reduce(
    (best, t) => (t.n > 0 && rateOf(t) > best.rate ? { rate: rateOf(t), n: t.n } : best),
    { rate: NEUTRAL_PRIOR, n: 0 },
  );
  // A heuristic that fits half the time is worth nothing; rescale 0.5..1 → 0..1.
  const consistencyRaw = clamp01((bestHeuristic.rate - 0.5) * 2);

  const preSwitch = switchBefore.n > 0 ? rateOf(switchBefore) : NEUTRAL_PRIOR;
  const postSwitch = switchAfter.n > 0 ? rateOf(switchAfter) : NEUTRAL_PRIOR;
  // 0.5 means the notice changed nothing; >0.5 means they broke their own habit.
  const reactanceRaw = clamp01(0.5 + (postSwitch - preSwitch) / 2);

  const meanDecisionMs = mean(latencies, DEFAULT_DECISION_MS);
  const switchDecisionMs = mean(switchLatencies, meanDecisionMs);
  const repeatDecisionMs = mean(repeatLatencies, meanDecisionMs);

  return {
    version: PROFILE_VERSION,
    winStayRate: estimate(winStay.successes, winStay.n),
    loseSwitchRate: estimate(loseSwitch.successes, loseSwitch.n),
    alternationRate: estimate(alternation.successes, alternation.n),
    explorationRate: estimate(exploration.successes, exploration.n),
    riskRate: estimate(risk.successes, risk.n),
    leftBias: estimate(left.successes, left.n),
    recencyWeight: estimate(recency.successes, recency.n),
    reactanceRate: estimateFromRate(reactanceRaw, switchAfter.n),
    consistencyScore: estimateFromRate(consistencyRaw, bestHeuristic.n, 0.25),
    winStreakStay: estimate(winStreakStay.successes, winStreakStay.n),
    lossStreakSwitch: estimate(lossStreakSwitch.successes, lossStreakSwitch.n),
    meanDecisionMs: Math.round(meanDecisionMs),
    switchDecisionMs: Math.round(switchDecisionMs),
    repeatDecisionMs: Math.round(repeatDecisionMs),
    hesitationDeltaMs: Math.round(switchDecisionMs - repeatDecisionMs),
    trials: ordered.length,
  };
}

/**
 * Fold Act II rounds into the trial vocabulary so the live profile keeps
 * sharpening as the player plays. The booth is modelled as one more channel
 * block; `A` sits left, `B` sits right, and which side holds the good odds is
 * randomised per game, so position bias stays interpretable.
 */
export function roundsToTrialRecords(
  rounds: readonly RoundRecord[],
  indexOffset: number,
): TrialRecord[] {
  const out: TrialRecord[] = [];
  for (const round of rounds) {
    const raw: RawTrialCapture = {
      trialId: `booth-${round.round}`,
      index: indexOffset + round.round,
      category: 'bandit',
      block: 'booth',
      optionOrder: ['booth:A', 'booth:B'],
      chosenOptionId: `booth:${round.choice}`,
      chosenPosition: round.choice === 'A' ? 'left' : 'right',
      responseMs: round.responseMs,
      timedOut: false,
      rewarded: round.win,
      // The booth tells the player outright that it has predicted them, so every
      // round is "after the notice" for reactance purposes.
      afterPatternNotice: true,
      riskyChosen: null,
    };
    out.push(annotateTrial(out, raw));
  }
  return out;
}

/** The profile a player starts with when no calibration data exists yet. */
export function neutralProfile(): BehaviorProfile {
  return deriveProfile([]);
}


function rateOf(t: Tally | undefined): number {
  if (!t || t.n === 0) return NEUTRAL_PRIOR;
  return t.successes / t.n;
}

function mean(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The compact, rounded view of the profile that leaves the device.
 *
 * Deliberately lossy: two decimals, no raw trial log, no identifiers, no
 * timestamps. Enough for the model to say something true, not enough to
 * reconstruct a session.
 */
export interface ProfileSummary {
  winStay: number;
  loseSwitch: number;
  alternation: number;
  exploration: number;
  risk: number;
  sideBias: number;
  recency: number;
  reactance: number;
  consistency: number;
  winStreakStay: number;
  lossStreakSwitch: number;
  meanMs: number;
  switchMs: number;
  repeatMs: number;
  hesitationMs: number;
  trials: number;
  /** Mean sample-size confidence across rate traits, 0..1. */
  evidence: number;
}

export function summarizeProfile(profile: BehaviorProfile): ProfileSummary {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rateTraits = [
    profile.winStayRate,
    profile.loseSwitchRate,
    profile.alternationRate,
    profile.explorationRate,
    profile.riskRate,
    profile.leftBias,
    profile.recencyWeight,
    profile.reactanceRate,
    profile.consistencyScore,
  ];
  return {
    winStay: r2(profile.winStayRate.value),
    loseSwitch: r2(profile.loseSwitchRate.value),
    alternation: r2(profile.alternationRate.value),
    exploration: r2(profile.explorationRate.value),
    risk: r2(profile.riskRate.value),
    sideBias: r2(profile.leftBias.value),
    recency: r2(profile.recencyWeight.value),
    reactance: r2(profile.reactanceRate.value),
    consistency: r2(profile.consistencyScore.value),
    winStreakStay: r2(profile.winStreakStay.value),
    lossStreakSwitch: r2(profile.lossStreakSwitch.value),
    meanMs: profile.meanDecisionMs,
    switchMs: profile.switchDecisionMs,
    repeatMs: profile.repeatDecisionMs,
    hesitationMs: profile.hesitationDeltaMs,
    trials: profile.trials,
    evidence: r2(rateTraits.reduce((a, t) => a + t.confidence, 0) / rateTraits.length),
  };
}
