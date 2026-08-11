/**
 * Shared domain types for hum(ai)n.
 *
 * Nothing in this file imports React, Next, or any server-only module: these
 * types are used by pure domain logic, by API route validation, and by the UI.
 */

/** The two machines in Act II. `A` is always rendered first (left / top). */
export type Side = 'A' | 'B';

/** Which physical position an option occupied when the player saw it. */
export type Position = 'left' | 'right';

/** Relationship of a choice to the immediately preceding choice in the same block. */
export type ChoiceRelation = 'repeat' | 'switch' | 'none';

/** Outcome of the immediately preceding rewarded trial in the same block. */
export type PriorOutcome = 'win' | 'loss' | 'none';

/**
 * Calibration trial families. Each family targets specific behavioral signals;
 * see `src/lib/behavior/trials.ts` for the exact instrument.
 */
export type TrialCategory =
  /** Free binary glyph choice, no feedback. Baseline side/position bias. */
  | 'bias'
  /** Hidden-probability channel learning. Win-stay, lose-switch, exploration, recency. */
  | 'bandit'
  /** Ambiguous visual sequence continuation. Repetition vs. alternation. */
  | 'sequence'
  /** Safe vs. variable payoff. Risk tolerance. */
  | 'risk'
  /** Free choice under a visible countdown. Decision speed under pressure. */
  | 'pressure'
  /** Bandit trial immediately following a "pattern detected" notice. Reactance. */
  | 'reactance';

/** One completed calibration trial. This is the only shape that is ever recorded. */
export interface TrialRecord {
  /** Stable identifier of the trial definition, e.g. `bandit-1`. */
  trialId: string;
  /** Zero-based position in the presented sequence. */
  index: number;
  category: TrialCategory;
  /**
   * Block identifier. Repeat/switch and win-stay/lose-switch are only computed
   * within a block, so unrelated trial families never contaminate each other.
   */
  block: string;
  /** Canonical option ids in the order they were displayed, left to right. */
  optionOrder: [string, string];
  /** Canonical id of the option the player selected. */
  chosenOptionId: string;
  /** Where the chosen option physically sat. Needed for unbiased side-bias math. */
  chosenPosition: Position;
  /** Milliseconds from trial paint to commit. */
  responseMs: number;
  /** True if the trial elapsed without a choice and was auto-committed. */
  timedOut: boolean;
  /** Reward result for rewarded trials; `null` when the trial gives no feedback. */
  rewarded: boolean | null;
  /** Relationship to the previous choice in this block. */
  relation: ChoiceRelation;
  /** Outcome of the previous rewarded trial in this block. */
  priorOutcome: PriorOutcome;
  /** Length of the run of consecutive identical outcomes immediately before this trial. */
  priorOutcomeStreak: number;
  /** True when a "pattern detected" notice preceded this trial. */
  afterPatternNotice: boolean;
  /** For `risk` trials: whether the variable-payoff option was taken. */
  riskyChosen: boolean | null;
}

/**
 * A single behavioral trait estimate.
 *
 * `value` is always smoothed toward the neutral prior so that a handful of
 * trials can never produce a 0% or 100% claim. `n` is the raw number of
 * informative observations and `confidence` is a 0..1 sample-size weight.
 */
export interface TraitEstimate {
  value: number;
  n: number;
  confidence: number;
}

/** Current schema version of the derived profile. Bump on breaking shape changes. */
export const PROFILE_VERSION = 2 as const;

/**
 * The compact behavioral model derived locally from calibration (and updated
 * live during Act II). Every field is documented at its point of derivation in
 * `src/lib/behavior/profile.ts`.
 */
export interface BehaviorProfile {
  version: typeof PROFILE_VERSION;
  /** P(repeat | previous rewarded choice won). */
  winStayRate: TraitEstimate;
  /** P(switch | previous rewarded choice lost). */
  loseSwitchRate: TraitEstimate;
  /** P(switch) across consecutive same-block choices. */
  alternationRate: TraitEstimate;
  /** P(choose the option with the lower observed payoff so far). */
  explorationRate: TraitEstimate;
  /** P(choose the variable-payoff option) in risk trials. */
  riskRate: TraitEstimate;
  /** P(choose the left-rendered option) across counterbalanced trials. */
  leftBias: TraitEstimate;
  /** P(follow the last outcome) when it conflicts with the cumulative record. */
  recencyWeight: TraitEstimate;
  /** Behavior change after being told a pattern was detected, centred on 0.5. */
  reactanceRate: TraitEstimate;
  /** In-sample hit rate of the best single simple heuristic, rescaled to 0..1. */
  consistencyScore: TraitEstimate;
  /** P(repeat | two or more consecutive wins). */
  winStreakStay: TraitEstimate;
  /** P(switch | two or more consecutive losses). */
  lossStreakSwitch: TraitEstimate;
  /** Mean commit latency across non-timed-out trials, milliseconds. */
  meanDecisionMs: number;
  /** Mean commit latency on trials where the player switched. */
  switchDecisionMs: number;
  /** Mean commit latency on trials where the player repeated. */
  repeatDecisionMs: number;
  /** `switchDecisionMs - repeatDecisionMs`. Positive means hesitation before switching. */
  hesitationDeltaMs: number;
  /** Number of trials the profile was derived from. */
  trials: number;
}

/** One completed Act II round. */
export interface RoundRecord {
  round: number;
  choice: Side;
  win: boolean;
  responseMs: number;
  predicted: Side;
  correct: boolean;
  confidence: number;
  /** `model` when a real/mock AI produced it, `local` when the fallback engine did. */
  predictionSource: PredictionSource;
}

export type PredictionSource = 'model' | 'local';

/** Everything the client needs while a prediction is sealed but unrevealed. */
export interface SealedTicket {
  /** Opaque authenticated-encryption token. Contains the prediction; unreadable client-side. */
  token: string;
  /** SHA-256 over the canonical envelope. Published before the choice. */
  commitment: string;
  round: number;
  issuedAt: string;
  expiresAt: string;
}

/** What the reveal endpoint returns once the player has committed. */
export interface RevealedPrediction {
  prediction: Side;
  confidence: number;
  reasoning: string;
  source: PredictionSource;
  correct: boolean;
  /** The exact envelope that was hashed into the commitment, for verification. */
  envelope: PredictionEnvelope;
  commitment: string;
}

/**
 * The sealed payload. Serialised canonically, hashed into the public commitment,
 * then encrypted. `nonce` makes the commitment non-brute-forceable: without it a
 * player could hash both candidate envelopes and read the prediction early.
 */
export interface PredictionEnvelope {
  v: 1;
  /**
   * A one-way reference to the session, not the session id itself. The envelope
   * is handed back to the browser at reveal so the commitment can be verified,
   * and the real session id lives in an HTTP-only cookie that JavaScript is not
   * supposed to be able to read — so it must not travel in the envelope either.
   */
  sessionRef: string;
  gameId: string;
  round: number;
  prediction: Side;
  confidence: number;
  reasoning: string;
  source: PredictionSource;
  issuedAt: string;
  requestId: string;
  nonce: string;
}

/** AI-authored reading of the calibration profile (Act I close). */
export interface ProfileInterpretation {
  headline: string;
  observation: string;
  traits: string[];
}

/** AI-authored closing report (Act III). */
export interface DebriefReport {
  tendencies: string[];
  paragraph: string;
  /** Fictional game framing. Not a real employability claim. */
  replacementViability: number;
  finalObservation: string;
}

