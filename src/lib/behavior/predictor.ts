/**
 * The local behavioral predictor.
 *
 * This is the fallback whenever the model is unavailable, rate-limited, over
 * budget, slow, or returns garbage — and it has to be a real predictor, not a
 * coin flip wearing a costume. It accumulates evidence in log-odds space from
 * the same signals the calibration profile measures, weighted by how much
 * evidence there actually was for each trait.
 *
 * Two properties matter and are both covered by tests:
 *  - it never silently defaults to `A`; a genuine tie goes to the injected RNG;
 *  - it is deterministic for a given profile, history and RNG.
 */

import type { BehaviorProfile, RoundRecord, Side } from '@/types';
import type { Rng } from './rng';

export interface LocalPrediction {
  prediction: Side;
  /** 0.5..0.92. Never claims certainty. */
  confidence: number;
  /** At most 12 words, matching the model's contract. */
  reasoning: string;
  source: 'local';
  /** True when evidence was too thin to lean either way and the RNG decided. */
  weakEvidence: boolean;
}

/** Signal weights. Tuned by hand; each is scaled by that trait's confidence. */
const W = {
  sideBias: 0.9,
  winStay: 1.5,
  loseSwitch: 1.5,
  streak: 0.8,
  alternation: 1.1,
  exploration: 0.7,
  momentum: 0.6,
  value: 1.0,
} as const;

/** Below this absolute log-odds the evidence is treated as no evidence at all. */
const WEAK_EVIDENCE_THRESHOLD = 0.18;
/** Maps log-odds magnitude onto the 0.5..0.92 confidence band. */
const CONFIDENCE_SLOPE = 0.16;
const CONFIDENCE_CEILING = 0.92;

/** Convert a rate to a signed pull in -1..1. */
const signed = (value: number) => (value - 0.5) * 2;

interface Contribution {
  name: string;
  /** Positive favours A, negative favours B. */
  z: number;
}

export interface LocalPredictionInput {
  profile: BehaviorProfile;
  history: readonly RoundRecord[];
  round: number;
  rng: Rng;
}

export function predictLocally(input: LocalPredictionInput): LocalPrediction {
  const { profile, history, rng } = input;
  const contributions: Contribution[] = [];

  // --- 1. Standing side preference, measured under counterbalanced display. ---
  contributions.push({
    name: 'side',
    z: signed(profile.leftBias.value) * profile.leftBias.confidence * W.sideBias,
  });

  const last = history[history.length - 1];

  if (last) {
    // `repeatPull > 0` means "expected to stay with the last machine".
    let repeatPull = 0;

    // --- 2. Reinforcement response to the immediately preceding outcome. ---
    // Recency scales this: a strongly recency-driven player reacts harder to it.
    const recencyGain = 0.7 + 0.6 * profile.recencyWeight.value;
    const streak = trailingOutcomeStreak(history);

    if (last.win) {
      repeatPull += signed(profile.winStayRate.value) * profile.winStayRate.confidence * W.winStay * recencyGain;
      if (streak >= 2) {
        repeatPull +=
          signed(profile.winStreakStay.value) * profile.winStreakStay.confidence * W.streak;
      }
    } else {
      repeatPull -=
        signed(profile.loseSwitchRate.value) * profile.loseSwitchRate.confidence * W.loseSwitch * recencyGain;
      if (streak >= 2) {
        repeatPull -=
          signed(profile.lossStreakSwitch.value) * profile.lossStreakSwitch.confidence * W.streak;
      }
    }

    // --- 3. Standing tendency to alternate regardless of outcome. ---
    repeatPull -=
      signed(profile.alternationRate.value) * profile.alternationRate.confidence * W.alternation;

    // --- 4. Explorers leave whatever they are on. ---
    repeatPull -=
      signed(profile.explorationRate.value) * profile.explorationRate.confidence * W.exploration;

    // --- 5. Behavioral momentum: a long run of identical pulls tends to continue. ---
    const run = trailingChoiceRun(history);
    if (run >= 3) repeatPull += W.momentum * Math.min(1, (run - 2) / 3);

    contributions.push({
      name: last.win ? 'reinforcement' : 'loss-response',
      z: last.choice === 'A' ? repeatPull : -repeatPull,
    });

    // --- 6. Reward learning: players drift toward whichever machine has paid. ---
    const paidA = observedRate(history, 'A');
    const paidB = observedRate(history, 'B');
    if (paidA !== null && paidB !== null && paidA !== paidB) {
      const greedyPull = (paidA - paidB) * W.value * (1 - profile.explorationRate.value);
      contributions.push({ name: 'value', z: greedyPull });
    }
  }

  const z = contributions.reduce((sum, c) => sum + c.z, 0);
  const magnitude = Math.abs(z);

  if (magnitude < WEAK_EVIDENCE_THRESHOLD) {
    // No lean. Resolve with real randomness rather than quietly answering "A".
    const prediction: Side = rng() < 0.5 ? 'A' : 'B';
    return {
      prediction,
      confidence: 0.5,
      reasoning: history.length === 0 ? 'No history yet; opening move is unconstrained.' : 'Evidence is balanced; no reliable lean either way.',
      source: 'local',
      weakEvidence: true,
    };
  }

  const prediction: Side = z > 0 ? 'A' : 'B';
  const confidence = Math.min(CONFIDENCE_CEILING, 0.5 + magnitude * CONFIDENCE_SLOPE);
  const dominant = contributions.reduce((best, c) => (Math.abs(c.z) > Math.abs(best.z) ? c : best));

  return {
    prediction,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: reasonFor(dominant.name, last, prediction),
    source: 'local',
    weakEvidence: false,
  };
}

/** Length of the run of identical outcomes at the end of the history. */
export function trailingOutcomeStreak(history: readonly RoundRecord[]): number {
  if (history.length === 0) return 0;
  const target = history[history.length - 1].win;
  let n = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].win === target) n += 1;
    else break;
  }
  return n;
}

/** Length of the run of identical choices at the end of the history. */
export function trailingChoiceRun(history: readonly RoundRecord[]): number {
  if (history.length === 0) return 0;
  const target = history[history.length - 1].choice;
  let n = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].choice === target) n += 1;
    else break;
  }
  return n;
}

/** Observed payout rate for a machine, or null if never pulled. */
export function observedRate(history: readonly RoundRecord[], side: Side): number | null {
  const pulls = history.filter((r) => r.choice === side);
  if (pulls.length === 0) return null;
  return pulls.filter((r) => r.win).length / pulls.length;
}

function reasonFor(signal: string, last: RoundRecord | undefined, prediction: Side): string {
  switch (signal) {
    case 'reinforcement':
      return last && last.choice === prediction
        ? 'Rewarded last pull; expected to stay put.'
        : 'Rewarded, yet drifts off a winning lever.';
    case 'loss-response':
      return last && last.choice === prediction
        ? 'Lost last pull but rarely abandons a lever.'
        : 'Lost last pull; switching is the habit.';
    case 'value':
      return 'Following the lever that has paid more often.';
    case 'side':
      return `Standing preference for the ${prediction === 'A' ? 'left' : 'right'} lever.`;
    default:
      return 'Recent choice pattern points one direction.';
  }
}

/**
 * Which machine the local engine expects to be *unhelpful* to reveal — used by
 * the debrief to describe the player without another paid call.
 */
export function describeDominantTraits(profile: BehaviorProfile): string[] {
  const candidates: Array<{ label: string; strength: number }> = [
    { label: 'Stays with a lever that has just paid', strength: dev(profile.winStayRate) },
    { label: 'Abandons a lever the moment it fails', strength: dev(profile.loseSwitchRate) },
    { label: 'Alternates rather than commits', strength: dev(profile.alternationRate) },
    { label: 'Keeps sampling after the answer is obvious', strength: dev(profile.explorationRate) },
    { label: 'Accepts variance for a larger return', strength: dev(profile.riskRate) },
    { label: 'Holds a fixed positional preference', strength: dev(profile.leftBias) },
    { label: 'Weighs the last result above the whole record', strength: dev(profile.recencyWeight) },
    { label: 'Changes course once told it is being read', strength: dev(profile.reactanceRate) },
    { label: 'Repeats a single readable strategy', strength: dev(profile.consistencyScore) },
  ];
  return candidates
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .map((c) => c.label);
}

/** How far a trait sits from neutral, discounted by how little evidence backs it. */
function dev(t: { value: number; confidence: number }): number {
  return Math.abs(t.value - 0.5) * (0.35 + 0.65 * t.confidence);
}
