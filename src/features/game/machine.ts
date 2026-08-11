/**
 * The game as a finite state machine.
 *
 * Every screen is one `Phase`, and every phase declares which events it accepts.
 * An event that is not legal for the current phase returns the state object
 * unchanged — nothing throws, nothing half-applies. A late server response for a
 * round the player has already left cannot rewind the game, and a double-click
 * cannot record two rounds.
 *
 * This module is pure: no React, no fetch, no clock, no randomness. The hook in
 * `useGame.ts` owns all of that and feeds results in as events.
 */

import type {
  BehaviorProfile,
  DebriefReport,
  ProfileInterpretation,
  RevealedPrediction,
  RoundRecord,
  Side,
  TrialRecord,
} from '@/types';
import type { CalibrationPlan } from '@/lib/behavior/trials';
import { annotateTrial } from '@/lib/behavior/profile';
import { REWARD_COINS, TOTAL_ROUNDS, accuracy } from '@/lib/behavior/scoring';

export type Phase =
  /** Black screen and a loading bar. No audio may play here. */
  | 'boot'
  /** The title screen. Menu static plays from here on. */
  | 'menu'
  /** The warning, reached from PLAY NOW. */
  | 'consent'
  /** Begin the assessment, or skip straight to the booth. */
  | 'choice'
  /** Answering questions. */
  | 'assessment_active'
  /** "testing your results…" → "Darry is ready." */
  | 'results_testing'
  /** Darry is picking. Machines dead. */
  | 'booth_picking'
  /** Darry has picked. Machines live. */
  | 'booth_ready'
  /** The round outcome. */
  | 'booth_result'
  /** "loading results…" */
  | 'ending_loading'
  /** "Unfortunately." → "You will be replaced." → the two percentages. */
  | 'ending';

/** What the browser holds while a prediction is sealed but not yet opened. */
export interface ClientTicket {
  /** Server-sealed token. Null on the offline fallback path. */
  token: string | null;
  /**
   * SHA-256 over the sealed envelope. Never shown to a player any more, but still
   * carried and still verified after the reveal — it is what proves the
   * prediction existed first.
   */
  commitment: string;
  round: number;
  issuedAt: string;
  /** True when the server sealed it with authenticated encryption. */
  attested: boolean;
}

export interface GameState {
  phase: Phase;
  gameId: string | null;
  /** Seeded only by the test harness; null means system randomness. */
  seed: number | null;

  /** True once the player has accepted the consent protocol. */
  consented: boolean;
  /** True when the player skipped the assessment. */
  skippedAssessment: boolean;

  plan: CalibrationPlan | null;
  questionIndex: number;

  /**
   * Everything Darry has already learned this session: assessment answers plus
   * every completed booth round from earlier games in this tab. Survives
   * `play again`; never written to disk.
   */
  carriedRecords: TrialRecord[];
  /**
   * Total reward value shown during the assessment.
   *
   * Deliberately **not** currency. The assessment pays out so that win-stay and
   * lose-switch have something to be measured against — the player has to see
   * whether an option returned anything for the instrument to work at all — but
   * none of it transfers into the booth. Kept here as a record of what the
   * assessment awarded; `coinsOf` never reads it.
   */
  assessmentFeedbackValue: number;

  profile: BehaviorProfile | null;
  /** Kept for the ending copy. Never rendered as a dashboard. */
  interpretation: ProfileInterpretation | null;
  resultsReady: boolean;

  odds: { A: number; B: number } | null;
  round: number;
  rounds: RoundRecord[];
  ticket: ClientTicket | null;
  reveal: RevealedPrediction | null;
  /** Set when a reveal envelope failed its commitment check. Test + debug signal. */
  sealBroken: boolean;

  debrief: DebriefReport | null;
}

export type GameEvent =
  | { type: 'BOOT'; seed: number | null }
  | { type: 'ENTER_MENU' }
  | { type: 'OPEN_CONSENT' }
  | { type: 'CLOSE_CONSENT' }
  | { type: 'ACCEPT_CONSENT' }
  | { type: 'START_ASSESSMENT'; plan: CalibrationPlan; gameId: string | null }
  | { type: 'RECORD_QUESTION'; record: TrialRecord; coins: number }
  | { type: 'PROFILE_DERIVED'; profile: BehaviorProfile }
  | { type: 'RESULTS_READY'; interpretation: ProfileInterpretation | null }
  | { type: 'SKIP_ASSESSMENT'; gameId: string | null; profile: BehaviorProfile; odds: { A: number; B: number } }
  | { type: 'ENTER_BOOTH'; odds: { A: number; B: number } }
  | { type: 'PREDICTION_SEALED'; ticket: ClientTicket }
  | {
      type: 'COMMIT_CHOICE';
      choice: Side;
      responseMs: number;
      win: boolean;
      reveal: RevealedPrediction;
      sealVerified: boolean;
      profile: BehaviorProfile;
    }
  | { type: 'NEXT_ROUND' }
  | { type: 'ENDING_READY'; debrief: DebriefReport }
  | { type: 'REPLAY'; gameId: string | null; odds: { A: number; B: number } };

export function initialState(): GameState {
  return {
    phase: 'boot',
    gameId: null,
    seed: null,
    consented: false,
    skippedAssessment: false,
    plan: null,
    questionIndex: 0,
    carriedRecords: [],
    assessmentFeedbackValue: 0,
    profile: null,
    interpretation: null,
    resultsReady: false,
    odds: null,
    round: 1,
    rounds: [],
    ticket: null,
    reveal: null,
    sealBroken: false,
    debrief: null,
  };
}

/** Which events each phase will act on. Anything else is ignored. */
const ALLOWED: Record<Phase, ReadonlyArray<GameEvent['type']>> = {
  boot: ['BOOT', 'ENTER_MENU'],
  menu: ['OPEN_CONSENT'],
  consent: ['CLOSE_CONSENT', 'ACCEPT_CONSENT'],
  choice: ['START_ASSESSMENT', 'SKIP_ASSESSMENT'],
  assessment_active: ['RECORD_QUESTION'],
  results_testing: ['PROFILE_DERIVED', 'RESULTS_READY', 'ENTER_BOOTH'],
  booth_picking: ['PREDICTION_SEALED'],
  booth_ready: ['COMMIT_CHOICE'],
  booth_result: ['NEXT_ROUND'],
  ending_loading: ['ENDING_READY'],
  ending: ['REPLAY'],
};

export function canHandle(phase: Phase, event: GameEvent['type']): boolean {
  return ALLOWED[phase].includes(event);
}

/** A fresh booth game. Odds, coins, history and tickets reset; learning does not. */
function resetBooth(state: GameState, gameId: string | null, odds: { A: number; B: number }): GameState {
  return {
    ...state,
    phase: 'booth_picking',
    gameId,
    odds,
    round: 1,
    rounds: [],
    ticket: null,
    reveal: null,
    debrief: null,
    sealBroken: false,
  };
}

export function reducer(state: GameState, event: GameEvent): GameState {
  if (!canHandle(state.phase, event.type)) return state;

  switch (event.type) {
    case 'BOOT':
      return { ...state, seed: event.seed };

    case 'ENTER_MENU':
      return { ...state, phase: 'menu' };

    case 'OPEN_CONSENT':
      return { ...state, phase: 'consent' };

    case 'CLOSE_CONSENT':
      // Back returns to the title screen — never to the boot sequence.
      return { ...state, phase: 'menu' };

    case 'ACCEPT_CONSENT':
      return { ...state, phase: 'choice', consented: true };

    case 'START_ASSESSMENT':
      return {
        ...state,
        phase: 'assessment_active',
        gameId: event.gameId,
        plan: event.plan,
        questionIndex: 0,
        skippedAssessment: false,
      };

    case 'SKIP_ASSESSMENT':
      // No assessment records, so Darry starts from a neutral, low-confidence
      // profile and learns only from the fifteen rounds.
      return resetBooth(
        { ...state, skippedAssessment: true, profile: event.profile, carriedRecords: [] },
        event.gameId,
        event.odds,
      );

    case 'RECORD_QUESTION': {
      if (!state.plan) return state;
      // Guard against a duplicate commit for a question already recorded.
      if (event.record.index !== state.questionIndex) return state;
      const carriedRecords = [...state.carriedRecords, event.record];
      const nextIndex = state.questionIndex + 1;
      const done = nextIndex >= state.plan.trials.length;
      return {
        ...state,
        carriedRecords,
        questionIndex: nextIndex,
        assessmentFeedbackValue: state.assessmentFeedbackValue + event.coins,
        phase: done ? 'results_testing' : 'assessment_active',
      };
    }

    case 'PROFILE_DERIVED':
      return { ...state, profile: event.profile };

    case 'RESULTS_READY':
      // Without a profile there is nothing to be ready about.
      if (!state.profile) return state;
      return { ...state, interpretation: event.interpretation, resultsReady: true };

    case 'ENTER_BOOTH':
      if (!state.resultsReady) return state;
      return resetBooth(state, state.gameId, event.odds);

    case 'PREDICTION_SEALED':
      // A ticket for a round the player has moved past is stale; ignore it.
      if (event.ticket.round !== state.round) return state;
      return { ...state, phase: 'booth_ready', ticket: event.ticket };

    case 'COMMIT_CHOICE': {
      if (!state.ticket) return state;
      const record: RoundRecord = {
        round: state.round,
        choice: event.choice,
        win: event.win,
        responseMs: event.responseMs,
        predicted: event.reveal.prediction,
        correct: event.reveal.correct,
        confidence: event.reveal.confidence,
        predictionSource: event.reveal.source,
      };
      return {
        ...state,
        phase: 'booth_result',
        rounds: [...state.rounds, record],
        reveal: event.reveal,
        profile: event.profile,
        sealBroken: state.sealBroken || !event.sealVerified,
      };
    }

    case 'NEXT_ROUND': {
      if (state.rounds.length >= TOTAL_ROUNDS) return { ...state, phase: 'ending_loading' };
      return {
        ...state,
        phase: 'booth_picking',
        round: state.round + 1,
        ticket: null,
        reveal: null,
      };
    }

    case 'ENDING_READY':
      return { ...state, phase: 'ending', debrief: event.debrief };

    case 'REPLAY':
      /*
       * Straight back into the booth. The assessment is not repeated, consent is
       * not reopened, and the interpretation is not requested again. What carries
       * over is everything Darry learned: the assessment answers plus every round
       * of the game just finished.
       */
      /*
       * `assessmentFeedbackValue` is left alone: it records what the assessment
       * awarded, which is still true on a replay. Booth coins need no resetting
       * because they are derived from `rounds`, which `resetBooth` clears.
       */
      return resetBooth(
        { ...state, carriedRecords: carryForward(state) },
        event.gameId,
        event.odds,
      );

    default:
      return state;
  }
}

/**
 * Fold the finished game's rounds into the carried record list, so the next game
 * starts with them already learned.
 *
 * Each game gets its own block id: round one of a new game has no predecessor, so
 * it must not be read as a repeat of the last pull of the previous game. Records
 * go through the same annotation path as assessment answers, so repeat/switch and
 * prior-outcome are derived identically.
 */
export function carryForward(state: GameState): TrialRecord[] {
  const offset = state.carriedRecords.length;
  const block = `booth-${state.gameId ?? 'x'}`;
  const added: TrialRecord[] = [];
  for (const round of state.rounds) {
    added.push(
      annotateTrial(added, {
        trialId: `${block}-${round.round}`,
        index: offset + round.round,
        category: 'bandit',
        block,
        optionOrder: ['booth:A', 'booth:B'],
        chosenOptionId: `booth:${round.choice}`,
        chosenPosition: round.choice === 'A' ? 'left' : 'right',
        responseMs: round.responseMs,
        timedOut: false,
        rewarded: round.win,
        // Darry announces that it has predicted them every single round.
        afterPatternNotice: true,
        riskyChosen: null,
      }),
    );
  }
  return [...state.carriedRecords, ...added];
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Booth coins.
 *
 * Derived from this game's rounds and nothing else, so the booth always opens at
 * zero — on the assessment path, on the skip path, on the first game and on every
 * replay. Assessment rewards are behavioural feedback, not currency, and are held
 * separately in `assessmentFeedbackValue`.
 */
export const coinsOf = (state: GameState): number =>
  state.rounds.filter((r) => r.win).length * REWARD_COINS;

export const accuracyOf = (state: GameState): number => accuracy(state.rounds);

/** Is the current phase one where a machine may be pressed? */
export const machinesEnabled = (state: GameState): boolean => state.phase === 'booth_ready';

/**
 * How hard the interface is pressing on the player, 0..1.
 *
 * Rises with progress and with how well Darry is actually reading them, so the
 * glitching tracks something real rather than just counting up. Drives noise,
 * scanline weight, corruption frequency and how far the red bleeds.
 */
export function dreadLevel(state: GameState): number {
  switch (state.phase) {
    case 'boot':
      return 0;
    case 'menu':
      return 0.08;
    case 'consent':
      return 0.14;
    case 'choice':
      return 0.18;
    case 'assessment_active': {
      const total = state.plan?.trials.length ?? 24;
      return Math.min(0.42, 0.2 + (state.questionIndex / total) * 0.22);
    }
    case 'results_testing':
      return 0.5;
    case 'ending_loading':
      return 0.85;
    case 'ending':
      return 1;
    default: {
      const progress = state.rounds.length / TOTAL_ROUNDS;
      const read = state.rounds.length >= 3 ? Math.max(0, accuracy(state.rounds) - 0.5) * 2 : 0;
      return Math.min(0.95, 0.5 + progress * 0.3 + read * 0.15);
    }
  }
}
