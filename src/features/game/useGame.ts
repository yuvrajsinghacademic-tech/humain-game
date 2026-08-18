'use client';

/**
 * Everything impure about the game lives here.
 *
 * The reducer in `machine.ts` decides what is legal; this hook decides when things
 * happen — randomness, timing, network — and feeds the results back in as events.
 * Each phase that needs an async step runs it exactly once, keyed by phase and
 * round, so a re-render (or React's development double-invoke) cannot buy two
 * predictions for the same round.
 *
 * The behavioural profile is held here in memory only. Nothing is written to disk;
 * refreshing the tab is a full reset, by design.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Side, TrialRecord } from '@/types';
import {
  annotateTrial,
  deriveProfile,
  neutralProfile,
  summarizeProfile,
  type RawTrialCapture,
} from '@/lib/behavior/profile';
import { computeDrift } from '@/lib/behavior/narrative';
import { mulberry32, randomBetween, systemRng, type Rng } from '@/lib/behavior/rng';
import { HIGH_ODDS_RANGE, LOW_ODDS_RANGE, TOTAL_ROUNDS, accuracy } from '@/lib/behavior/scoring';
import { buildCalibrationPlan, resolveTrialReward, type PreparedTrial } from '@/lib/behavior/trials';
import {
  requestDebrief,
  requestInterpretation,
  requestSealedPrediction,
  revealPrediction,
  startSession,
} from '@/features/prediction/api';
import type { LocalTicket } from '@/features/prediction/localTicket';
import { purgeRetiredProfilesFromWindow } from '@/lib/storage';
import { track } from '@/lib/analytics/events';
import { getAudio } from '@/lib/audio/track';
import { LOADING_MIN_MS } from '@/features/ending/Ending';
import {
  coinsOf,
  dreadLevel,
  initialState,
  machinesEnabled,
  reducer,
  type GameState,
} from './machine';

/**
 * Darry must visibly deliberate. Even when a mocked or cached prediction returns
 * instantly, the picking state is held this long so the precommitment is something
 * the player actually experiences rather than a flicker.
 */
export const MIN_PICKING_MS = 500;

/** The seed override is test-only and gated behind an explicit build flag. */
function seedFromLocation(): number | null {
  if (process.env.NEXT_PUBLIC_ALLOW_SEED !== 'true') return null;
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Enforce a minimum wall-clock duration for a step, without shortening a slow one. */
async function atLeast<T>(minMs: number, work: Promise<T>, startedAt: number): Promise<T> {
  const result = await work;
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) await wait(minMs - elapsed);
  return result;
}

export interface UseGame {
  state: GameState;
  currentQuestion: PreparedTrial | null;
  coins: number;
  dread: number;
  machinesLive: boolean;
  enterMenu: () => void;
  openConsent: () => void;
  closeConsent: () => void;
  acceptConsent: () => void;
  beginAssessment: () => void;
  skipAssessment: () => void;
  resolveQuestion: (optionId: string) => { rewarded: boolean | null; coins: number };
  commitQuestion: (input: {
    optionId: string;
    position: 'left' | 'right';
    responseMs: number;
    timedOut: boolean;
    rewarded: boolean | null;
    coins: number;
  }) => void;
  enterBooth: () => void;
  pull: (side: Side) => void;
  nextRound: () => void;
  playAgain: () => void;
}

export function useGame(): UseGame {
  const [state, dispatch] = useReducer(reducer, initialState());

  const rngRef = useRef<Rng>(systemRng);
  const localTicketRef = useRef<LocalTicket | null>(null);
  const sealedAtRef = useRef<number>(0);
  const oncePerStep = useRef<Set<string>>(new Set());
  const booted = useRef(false);

  const runOnce = useCallback((key: string, work: () => void | Promise<void>) => {
    if (oncePerStep.current.has(key)) return;
    oncePerStep.current.add(key);
    void work();
  }, []);

  /** Fresh hidden odds. Which visible side is generous is decided per game. */
  const rollOdds = useCallback((): { A: number; B: number } => {
    const rng = rngRef.current;
    const high = randomBetween(rng, HIGH_ODDS_RANGE[0], HIGH_ODDS_RANGE[1]);
    const low = randomBetween(rng, LOW_ODDS_RANGE[0], LOW_ODDS_RANGE[1]);
    return rng() < 0.5 ? { A: high, B: low } : { A: low, B: high };
  }, []);

  // --- Boot: install the RNG and retire anything the old version stored. ---
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const seed = seedFromLocation();
    rngRef.current = seed === null ? systemRng : mulberry32(seed);
    // The previous release persisted behavioural profiles. They are deleted here
    // rather than migrated: this version never loads a profile from disk.
    purgeRetiredProfilesFromWindow();
    dispatch({ type: 'BOOT', seed });
  }, []);

  // --- Assessment close: derive the profile, then ask Darry to read it. ---
  useEffect(() => {
    if (state.phase !== 'results_testing') return;
    if (state.resultsReady) return;

    runOnce(`results:${state.gameId ?? 'none'}`, async () => {
      // Reaching this phase *is* completing the assessment: it is entered only by
      // answering the last question. Nothing about the answers is sent — see
      // `src/lib/analytics/events.ts`, which will not carry them.
      track('assessment_completed');

      const profile = deriveProfile(state.carriedRecords);
      dispatch({ type: 'PROFILE_DERIVED', profile });

      // Kept internally for the ending copy; never shown as a dashboard.
      const { interpretation } = await requestInterpretation({
        gameId: state.gameId,
        profile: summarizeProfile(profile),
      });
      dispatch({ type: 'RESULTS_READY', interpretation });
    });
  }, [state.phase, state.resultsReady, state.gameId, state.carriedRecords, runOnce]);

  // --- Darry picks, before the machines can be touched. ---
  useEffect(() => {
    if (state.phase !== 'booth_picking') return;
    const profile = state.profile;
    if (!profile) return;

    runOnce(`ticket:${state.gameId ?? 'none'}:${state.round}`, async () => {
      const startedAt = Date.now();
      const result = await atLeast(
        MIN_PICKING_MS,
        requestSealedPrediction({
          gameId: state.gameId,
          round: state.round,
          profile: summarizeProfile(profile),
          history: state.rounds.map((r) => ({
            round: r.round,
            choice: r.choice,
            win: r.win,
            ms: r.responseMs,
          })),
        }),
        startedAt,
      );
      localTicketRef.current = result.local;
      sealedAtRef.current = Date.now();
      dispatch({ type: 'PREDICTION_SEALED', ticket: result.ticket });
    });
  }, [state.phase, state.gameId, state.round, state.profile, state.rounds, runOnce]);

  /*
   * Results silence. Fired on entering the phase rather than after the report arrives,
   * so the fade runs on its own clock and a fast API response cannot truncate it. By
   * the time the verdict appears the track is paused and rewound.
   */
  useEffect(() => {
    if (state.phase !== 'ending_loading') return;
    void getAudio().setMode('results');
  }, [state.phase]);

  // --- The closing report. ---
  useEffect(() => {
    if (state.phase !== 'ending_loading') return;
    const profile = state.profile;
    if (!profile) return;

    runOnce(`ending:${state.gameId ?? 'none'}`, async () => {
      const startedAt = Date.now();
      const history = state.rounds.map((r) => ({
        round: r.round,
        choice: r.choice,
        win: r.win,
        ms: r.responseMs,
      }));
      const { debrief } = await atLeast(
        LOADING_MIN_MS,
        requestDebrief({
          gameId: state.gameId,
          profile: summarizeProfile(profile),
          history,
          predictions: state.rounds.map((r) => ({
            round: r.round,
            predicted: r.predicted,
            correct: r.correct,
          })),
          accuracy: accuracy(state.rounds),
          drift: computeDrift(state.rounds),
        }),
        startedAt,
      );
      dispatch({ type: 'ENDING_READY', debrief });
    });
  }, [state.phase, state.gameId, state.profile, state.rounds, runOnce]);

  /*
   * --- The funnel ------------------------------------------------------------
   *
   * Six counters, and that is the entire product-analytics surface. They answer one
   * question: of the people who arrive from a printed code, how many start, how many
   * finish, and how many share. Reaching the ending is recorded here rather than in
   * the reveal effect above so it fires once the player is actually looking at the
   * verdict, and it is keyed by game id so a replay counts as a second completion.
   *
   * No event carries a profile, an answer, a score, a prediction or a verdict. That
   * is enforced by the helper, not by this call site.
   */
  useEffect(() => {
    if (state.phase !== 'ending') return;
    runOnce(`completed:${state.gameId ?? 'none'}`, () => track('game_completed'));
  }, [state.phase, state.gameId, runOnce]);

  // --- Player intents ---------------------------------------------------------

  /**
   * ENTER. The only place audio may begin: a browser will not start playback without
   * a user gesture, and this is that gesture.
   */
  const enterMenu = useCallback(() => {
    const audio = getAudio();
    void audio.unlock().then(() => audio.setMode('menu'));
    dispatch({ type: 'ENTER_MENU' });
  }, []);

  /*
   * PLAY NOW and BACK are deliberately silent about audio. The warning is still the
   * front of the house: it opens over a menu that is still there, at full volume, and
   * backing out of it changes nothing. Dropping the level here would spend the
   * transition on a screen the player may simply leave.
   */
  const openConsent = useCallback(() => dispatch({ type: 'OPEN_CONSENT' }), []);
  const closeConsent = useCallback(() => dispatch({ type: 'CLOSE_CONSENT' }), []);

  /**
   * I UNDERSTAND. CONTINUE. — the one point where the volume drops.
   *
   * Accepting is the commitment, so it is what quietens the room: the same playback
   * slides from the menu level down to the gameplay level over the long fade while the
   * screen changes underneath it. Nothing is stopped, restarted or rewound.
   */
  const acceptConsent = useCallback(() => {
    // The point a visitor becomes a player: they have read the warning and gone on.
    track('play_started');
    void getAudio().setMode('game');
    dispatch({ type: 'ACCEPT_CONSENT' });
  }, []);

  const beginAssessment = useCallback(() => {
    void (async () => {
      // A refused session is not fatal: the game runs on locally sealed tickets.
      const gameId = await startSession();
      dispatch({ type: 'START_ASSESSMENT', plan: buildCalibrationPlan(rngRef.current), gameId });
    })();
  }, []);

  const skipAssessment = useCallback(() => {
    void (async () => {
      track('booth_started');
      const gameId = await startSession();
      /*
       * No questions were answered, so there is nothing to interpret and no
       * interpretation call is made. Darry starts from a neutral profile — every
       * rate at 0.5 with zero observations behind it — and learns only from the
       * fifteen rounds.
       */
      dispatch({
        type: 'SKIP_ASSESSMENT',
        gameId,
        profile: neutralProfile(),
        odds: rollOdds(),
      });
    })();
  }, [rollOdds]);

  const resolveQuestion = useCallback<UseGame['resolveQuestion']>(
    (optionId) => {
      const plan = state.plan;
      const trial = plan?.trials[state.questionIndex];
      if (!plan || !trial) return { rewarded: null, coins: 0 };
      return resolveTrialReward(trial, optionId, plan, rngRef.current);
    },
    [state.plan, state.questionIndex],
  );

  const commitQuestion = useCallback<UseGame['commitQuestion']>(
    ({ optionId, position, responseMs, timedOut, rewarded, coins }) => {
      const plan = state.plan;
      if (!plan) return;
      const trial = plan.trials[state.questionIndex];
      if (!trial) return;

      const raw: RawTrialCapture = {
        trialId: trial.id,
        index: state.questionIndex,
        category: trial.category,
        block: trial.block,
        optionOrder: [trial.displayed[0].id, trial.displayed[1].id],
        chosenOptionId: optionId,
        chosenPosition: position,
        responseMs,
        timedOut,
        rewarded,
        // Every question from Darry's first pattern claim onward.
        afterPatternNotice: plan.trials
          .slice(0, state.questionIndex + 1)
          .some((candidate) => Boolean(candidate.patternClaim)),
        riskyChosen: trial.feedback === 'wager' ? optionId.endsWith(':risky') : null,
      };
      const record: TrialRecord = annotateTrial(state.carriedRecords, raw);
      dispatch({ type: 'RECORD_QUESTION', record, coins });

    },
    [state.plan, state.questionIndex, state.carriedRecords],
  );

  const enterBooth = useCallback(() => {
    // First entry only. A replay is counted as `play_again`, not as a second start.
    track('booth_started');
    dispatch({ type: 'ENTER_BOOTH', odds: rollOdds() });
  }, [rollOdds]);

  const pull = useCallback(
    (side: Side) => {
      if (state.phase !== 'booth_ready') return;
      const ticket = state.ticket;
      const odds = state.odds;
      if (!ticket || !odds) return;

      const responseMs = Math.max(1, Date.now() - sealedAtRef.current);
      const win = rngRef.current() < odds[side];

      // Guarded so a fast double-click cannot record the round twice.
      runOnce(`pull:${state.gameId ?? 'none'}:${state.round}`, async () => {
        const { reveal, sealVerified } = await revealPrediction({
          gameId: state.gameId,
          round: state.round,
          ticket,
          local: localTicketRef.current,
          choice: side,
        });

        const rounds = [
          ...state.rounds,
          {
            round: state.round,
            choice: side,
            win,
            responseMs,
            predicted: reveal.prediction,
            correct: reveal.correct,
            confidence: reveal.confidence,
            predictionSource: reveal.source,
          },
        ];
        // Darry keeps sharpening: everything it already knew, plus this game so far.
        const boothRecords = boothToRecords(rounds, state.carriedRecords.length, state.gameId);
        const updated = deriveProfile([...state.carriedRecords, ...boothRecords]);

        dispatch({
          type: 'COMMIT_CHOICE',
          choice: side,
          responseMs,
          win,
          reveal,
          sealVerified,
          profile: updated,
        });
      });
    },
    [
      state.phase,
      state.ticket,
      state.odds,
      state.gameId,
      state.round,
      state.rounds,
      state.carriedRecords,
      runOnce,
    ],
  );

  const nextRound = useCallback(() => {
    localTicketRef.current = null;
    dispatch({ type: 'NEXT_ROUND' });
  }, []);

  const playAgain = useCallback(() => {
    void (async () => {
      track('play_again');
      /*
       * Straight back into the booth. The assessment is not repeated and the
       * interpretation is not requested again — a new game id is issued so the
       * per-game quotas reset, and everything Darry learned stays in memory.
       */
      const gameId = await startSession();
      oncePerStep.current.clear();
      localTicketRef.current = null;
      // The static was faded out and paused for the results; start it again from the
      // top, from silence, and settle at the quiet gameplay level.
      void getAudio().setMode('game', { restart: true });
      dispatch({ type: 'REPLAY', gameId, odds: rollOdds() });
    })();
  }, [rollOdds]);

  const currentQuestion = useMemo(
    () => state.plan?.trials[state.questionIndex] ?? null,
    [state.plan, state.questionIndex],
  );

  return {
    state,
    currentQuestion,
    coins: coinsOf(state),
    dread: dreadLevel(state),
    machinesLive: machinesEnabled(state),
    openConsent,
    closeConsent,
    acceptConsent,
    beginAssessment,
    skipAssessment,
    resolveQuestion,
    commitQuestion,
    enterMenu,
    enterBooth,
    pull,
    nextRound,
    playAgain,
  };
}

/** Convert this game's rounds into the trial vocabulary the profile is built from. */
function boothToRecords(
  rounds: ReadonlyArray<{ round: number; choice: Side; win: boolean; responseMs: number }>,
  offset: number,
  gameId: string | null,
): TrialRecord[] {
  const block = `booth-${gameId ?? 'x'}`;
  const out: TrialRecord[] = [];
  for (const round of rounds) {
    out.push(
      annotateTrial(out, {
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
        afterPatternNotice: true,
        riskyChosen: null,
      }),
    );
  }
  return out;
}

export { TOTAL_ROUNDS };
