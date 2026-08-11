import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  canHandle,
  carryForward,
  coinsOf,
  dreadLevel,
  initialState,
  machinesEnabled,
  reducer,
  type GameEvent,
  type GameState,
  type Phase,
} from '@/features/game/machine';
import { deriveProfile, neutralProfile } from '@/lib/behavior/profile';
import {
  REWARD_COINS,
  TOTAL_ROUNDS,
  accuracyPercent,
  betterMachine,
  correctCount,
  optimalChoiceRate,
  predictabilityDrift,
} from '@/lib/behavior/scoring';
import { buildCalibrationPlan } from '@/lib/behavior/trials';
import { mulberry32 } from '@/lib/behavior/rng';
import type { RevealedPrediction, Side, TrialRecord } from '@/types';
import { buildRounds, buildTrials } from './factories';

const plan = () => buildCalibrationPlan(mulberry32(11));
const ODDS = { A: 0.75, B: 0.25 };

const reveal = (prediction: Side, correct: boolean): RevealedPrediction => ({
  prediction,
  confidence: 0.7,
  reasoning: 'Holds the lever that has just paid out.',
  source: 'model',
  correct,
  commitment: 'a'.repeat(64),
  envelope: {
    v: 1,
    sessionRef: 'ref',
    gameId: 'game-abcdefgh',
    round: 1,
    prediction,
    confidence: 0.7,
    reasoning: 'Holds the lever that has just paid out.',
    source: 'model',
    issuedAt: '2026-08-10T00:00:00.000Z',
    requestId: 'req',
    nonce: 'nonce',
  },
});

const ticket = (round: number) => ({
  token: 't',
  commitment: 'c',
  round,
  issuedAt: 'now',
  attested: true,
});

const commit = (choice: Side, correct: boolean, win = true): GameEvent => ({
  type: 'COMMIT_CHOICE',
  choice,
  responseMs: 700,
  win,
  reveal: reveal(correct ? choice : choice === 'A' ? 'B' : 'A', correct),
  sealVerified: true,
  profile: neutralProfile(),
});

/** Boot cleared, menu reached. */
function atMenu(): GameState {
  return reducer(initialState(), { type: 'ENTER_MENU' });
}

/** Consent accepted, sitting on the fork. */
function atChoice(): GameState {
  let state = atMenu();
  state = reducer(state, { type: 'OPEN_CONSENT' });
  state = reducer(state, { type: 'ACCEPT_CONSENT' });
  return state;
}

/** Skipped the assessment, so already in the booth with Darry deciding. */
function skipped(): GameState {
  return reducer(atChoice(), {
    type: 'SKIP_ASSESSMENT',
    gameId: 'game-abcdefgh',
    profile: neutralProfile(),
    odds: ODDS,
  });
}

/** Completed the assessment and reached a live machine. */
function atLiveMachines(): GameState {
  let state = atChoice();
  state = reducer(state, { type: 'START_ASSESSMENT', plan: plan(), gameId: 'game-abcdefgh' });

  const records: TrialRecord[] = buildTrials(
    Array.from({ length: state.plan!.trials.length }, () => ({ option: 'one' as const, rewarded: true })),
  );
  records.forEach((record, index) => {
    state = reducer(state, { type: 'RECORD_QUESTION', record: { ...record, index }, coins: 1 });
  });

  state = reducer(state, { type: 'PROFILE_DERIVED', profile: deriveProfile(records) });
  state = reducer(state, {
    type: 'RESULTS_READY',
    interpretation: { headline: 'h', observation: 'o', traits: ['a', 'b', 'c'] },
  });
  state = reducer(state, { type: 'ENTER_BOOTH', odds: ODDS });
  state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(1) });
  return state;
}

/** Play a whole booth game out to the ending. */
function playToEnding(from: GameState): GameState {
  let state = from;
  for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
    if (state.phase === 'booth_picking') {
      state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(state.round) });
    }
    state = reducer(state, commit('A', round % 2 === 0));
    state = reducer(state, { type: 'NEXT_ROUND' });
  }
  return reducer(state, {
    type: 'ENDING_READY',
    debrief: {
      tendencies: ['a', 'b', 'c'],
      paragraph: 'p',
      replacementViability: 61,
      finalObservation: 'Nothing you did was unavailable to Darry.',
    },
  });
}

describe('boot, menu and consent', () => {
  it('starts on the boot screen with nothing recorded', () => {
    const state = initialState();
    expect(state.phase).toBe('boot');
    expect(state.consented).toBe(false);
    expect(state.rounds).toHaveLength(0);
    expect(state.profile).toBeNull();
  });

  it('reaches the menu from the boot screen, and not before', () => {
    // ENTER is the only way out of boot, and the only place audio may begin.
    expect(reducer(initialState(), { type: 'OPEN_CONSENT' }).phase).toBe('boot');
    expect(atMenu().phase).toBe('menu');
  });

  it('opens the warning from the menu', () => {
    expect(reducer(atMenu(), { type: 'OPEN_CONSENT' }).phase).toBe('consent');
  });

  it('blocks entry until consent is accepted', () => {
    const consenting = reducer(atMenu(), { type: 'OPEN_CONSENT' });
    // Nothing but back or accept is legal here — the assessment cannot be started.
    expect(reducer(consenting, { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g' })).toBe(consenting);
    expect(
      reducer(consenting, {
        type: 'SKIP_ASSESSMENT',
        gameId: 'g',
        profile: neutralProfile(),
        odds: ODDS,
      }),
    ).toBe(consenting);
    expect(consenting.consented).toBe(false);
  });

  it('returns to the menu on Back, never to the boot screen', () => {
    const back = reducer(reducer(atMenu(), { type: 'OPEN_CONSENT' }), { type: 'CLOSE_CONSENT' });
    expect(back.phase).toBe('menu');
    expect(back.consented).toBe(false);
  });

  it('reaches the fork once consent is accepted', () => {
    const accepted = atChoice();
    expect(accepted.phase).toBe('choice');
    expect(accepted.consented).toBe(true);
  });
});

describe('assessment path', () => {
  it('begins at question one', () => {
    const state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    expect(state.phase).toBe('assessment_active');
    expect(state.questionIndex).toBe(0);
    expect(state.skippedAssessment).toBe(false);
  });

  it('moves to the results transition after the final answer', () => {
    let state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    const total = state.plan!.trials.length;
    const records = buildTrials(Array.from({ length: total }, () => ({ option: 'one' as const })));
    records.forEach((record, index) => {
      state = reducer(state, { type: 'RECORD_QUESTION', record: { ...record, index }, coins: 0 });
    });
    expect(state.phase).toBe('results_testing');
    expect(state.carriedRecords).toHaveLength(total);
  });

  it('will not leave the results transition before a profile exists', () => {
    let state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    state = { ...state, phase: 'results_testing' };
    const early = reducer(state, { type: 'RESULTS_READY', interpretation: null });
    expect(early.resultsReady).toBe(false);
    expect(reducer(early, { type: 'ENTER_BOOTH', odds: ODDS }).phase).toBe('results_testing');
  });

  it('ignores a duplicate answer for an index already recorded', () => {
    let state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    const [record] = buildTrials([{ option: 'one', rewarded: true }]);
    state = reducer(state, { type: 'RECORD_QUESTION', record, coins: 1 });
    expect(state.questionIndex).toBe(1);
    expect(reducer(state, { type: 'RECORD_QUESTION', record, coins: 1 })).toBe(state);
  });

  it('accepts nothing but an answer while a question is on screen', () => {
    // Interruptions were removed: reactions are presentation-only and never events,
    // so the assessment phase has exactly one legal input.
    let state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    const [record] = buildTrials([{ option: 'one', rewarded: true }]);
    state = reducer(state, { type: 'RECORD_QUESTION', record, coins: 1 });
    expect(state.questionIndex).toBe(1);
    expect(state.phase).toBe('assessment_active');
  });
});

describe('skip path', () => {
  it('goes straight into the booth with Darry deciding', () => {
    const state = skipped();
    expect(state.phase).toBe('booth_picking');
    expect(state.skippedAssessment).toBe(true);
    expect(state.odds).toEqual(ODDS);
    expect(state.round).toBe(1);
  });

  it('carries a neutral, low-confidence profile and no answers', () => {
    const state = skipped();
    expect(state.carriedRecords).toHaveLength(0);
    expect(state.profile?.winStayRate.value).toBe(0.5);
    expect(state.profile?.winStayRate.n).toBe(0);
    expect(state.profile?.winStayRate.confidence).toBe(0);
    expect(state.profile?.trials).toBe(0);
  });

  it('never enters the results transition, so no interpretation can be requested', () => {
    // The interpretation is triggered by `results_testing` and nothing else, so a
    // skipping player structurally cannot cause that call.
    const state = skipped();
    expect(state.resultsReady).toBe(false);
    expect(state.interpretation).toBeNull();
  });
});

describe('the precommitment, in the state machine', () => {
  it('holds the machines closed until a prediction is sealed', () => {
    const picking = skipped();
    expect(picking.phase).toBe('booth_picking');
    expect(machinesEnabled(picking)).toBe(false);

    // A pull attempted while Darry is still deciding does nothing at all.
    expect(reducer(picking, commit('A', true))).toBe(picking);
    expect(picking.rounds).toHaveLength(0);
  });

  it('opens the machines only on a sealed prediction', () => {
    const ready = reducer(skipped(), { type: 'PREDICTION_SEALED', ticket: ticket(1) });
    expect(ready.phase).toBe('booth_ready');
    expect(machinesEnabled(ready)).toBe(true);
    expect(ready.ticket).not.toBeNull();
  });

  it('ignores a ticket for a round already left behind', () => {
    const stale = reducer(
      { ...skipped(), round: 4 },
      { type: 'PREDICTION_SEALED', ticket: ticket(2) },
    );
    expect(stale.phase).toBe('booth_picking');
    expect(stale.ticket).toBeNull();
  });

  it('cannot record two rounds from a double commit', () => {
    const ready = atLiveMachines();
    const first = reducer(ready, commit('A', true));
    expect(first.rounds).toHaveLength(1);
    expect(reducer(first, commit('B', true))).toBe(first);
  });

  it('remembers a failed commitment check for the whole game', () => {
    let state = reducer(atLiveMachines(), {
      ...commit('A', true),
      sealVerified: false,
    } as GameEvent);
    expect(state.sealBroken).toBe(true);
    state = reducer(state, { type: 'NEXT_ROUND' });
    state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(state.round) });
    state = reducer(state, commit('A', true));
    expect(state.sealBroken).toBe(true);
  });
});

describe('rounds and the ending', () => {
  it('reaches the ending after the fifteenth round and not before', () => {
    let state = atLiveMachines();
    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      if (state.phase === 'booth_picking') {
        state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(state.round) });
      }
      state = reducer(state, commit('A', true));
      expect(state.phase).toBe('booth_result');
      state = reducer(state, { type: 'NEXT_ROUND' });
    }
    expect(state.phase).toBe('ending_loading');
    expect(state.rounds).toHaveLength(TOTAL_ROUNDS);
  });

  it('enforces the round maximum', () => {
    const state: GameState = {
      ...atLiveMachines(),
      phase: 'booth_result',
      round: TOTAL_ROUNDS,
      rounds: buildRounds('A'.repeat(TOTAL_ROUNDS), '1'.repeat(TOTAL_ROUNDS)),
    };
    const next = reducer(state, { type: 'NEXT_ROUND' });
    expect(next.phase).toBe('ending_loading');
    expect(next.round).toBe(TOTAL_ROUNDS);
  });

  it('lands on the ending when the report arrives', () => {
    const ended = playToEnding(atLiveMachines());
    expect(ended.phase).toBe('ending');
    expect(ended.debrief?.replacementViability).toBe(61);
  });
});

describe('play again', () => {
  it('returns straight to the booth without repeating anything', () => {
    const ended = playToEnding(atLiveMachines());
    const again = reducer(ended, { type: 'REPLAY', gameId: 'game-second01', odds: { A: 0.2, B: 0.7 } });

    expect(again.phase).toBe('booth_picking');
    // Not the opening, not consent, not the assessment, not the transition.
    expect(again.consented).toBe(true);
    expect(again.resultsReady).toBe(ended.resultsReady);
    expect(again.plan).toBe(ended.plan);
  });

  it('resets the game but keeps what Darry learned', () => {
    const ended = playToEnding(atLiveMachines());
    const learnedBefore = ended.carriedRecords.length;
    const again = reducer(ended, { type: 'REPLAY', gameId: 'game-second01', odds: { A: 0.2, B: 0.7 } });

    expect(again.rounds).toHaveLength(0);
    expect(again.round).toBe(1);
    expect(again.ticket).toBeNull();
    expect(again.reveal).toBeNull();
    expect(again.debrief).toBeNull();
    expect(again.odds).toEqual({ A: 0.2, B: 0.7 });
    expect(again.gameId).toBe('game-second01');
    expect(coinsOf(again)).toBe(0);

    // Fifteen rounds of evidence carried forward on top of the assessment.
    expect(again.carriedRecords.length).toBe(learnedBefore + TOTAL_ROUNDS);
    expect(again.profile).not.toBeNull();
  });

  it('does not treat the first pull of a new game as a repeat of the last', () => {
    const ended = playToEnding(atLiveMachines());
    const carried = carryForward(ended);
    const boothRecords = carried.slice(ended.carriedRecords.length);
    expect(boothRecords[0].relation).toBe('none');
    expect(boothRecords[1].relation).toBe('repeat');
    // Each game is its own block, so blocks never bleed across replays.
    expect(new Set(boothRecords.map((record) => record.block)).size).toBe(1);
  });

  it('keeps learning across two replays', () => {
    let state = playToEnding(atLiveMachines());
    const first = state.carriedRecords.length;
    state = reducer(state, { type: 'REPLAY', gameId: 'game-second01', odds: ODDS });
    const second = state.carriedRecords.length;
    state = playToEnding(state);
    state = reducer(state, { type: 'REPLAY', gameId: 'game-third001', odds: ODDS });
    expect(second).toBeGreaterThan(first);
    expect(state.carriedRecords.length).toBeGreaterThan(second);
  });
});

describe('invalid transitions', () => {
  it('returns the identical state object for an out-of-phase event', () => {
    const state = initialState();
    const next = reducer(state, { type: 'NEXT_ROUND' });
    expect(next).toBe(state);
  });

  it('declares which events each phase accepts', () => {
    expect(canHandle('boot', 'ENTER_MENU')).toBe(true);
    expect(canHandle('boot', 'OPEN_CONSENT')).toBe(false);
    expect(canHandle('menu', 'OPEN_CONSENT')).toBe(true);
    expect(canHandle('menu', 'COMMIT_CHOICE')).toBe(false);
    expect(canHandle('consent', 'ACCEPT_CONSENT')).toBe(true);
    expect(canHandle('choice', 'SKIP_ASSESSMENT')).toBe(true);
    expect(canHandle('booth_picking', 'COMMIT_CHOICE')).toBe(false);
    expect(canHandle('booth_ready', 'COMMIT_CHOICE')).toBe(true);
    expect(canHandle('booth_ready', 'NEXT_ROUND')).toBe(false);
    expect(canHandle('ending', 'REPLAY')).toBe(true);
  });

  it('rejects every event a phase does not accept', () => {
    const events: GameEvent[] = [
      { type: 'ENTER_MENU' },
      { type: 'OPEN_CONSENT' },
      { type: 'ACCEPT_CONSENT' },
      { type: 'NEXT_ROUND' },
      { type: 'ENTER_BOOTH', odds: ODDS },
      { type: 'REPLAY', gameId: 'g', odds: ODDS },
    ];
    const state: GameState = { ...initialState(), phase: 'assessment_active', plan: plan() };
    for (const event of events) {
      expect(reducer(state, event)).toBe(state);
    }
  });
});

describe('selectors', () => {
  it('counts booth winnings only, never assessment rewards', () => {
    const state: GameState = {
      ...initialState(),
      assessmentFeedbackValue: 37,
      rounds: buildRounds('AAB', '110'),
    };
    expect(coinsOf(state)).toBe(2 * REWARD_COINS);
  });

  it('reports accuracy from the recorded rounds', () => {
    const state: GameState = { ...initialState(), rounds: buildRounds('AABB', '1111', 'AAAA') };
    expect(accuracyOf(state)).toBeCloseTo(0.5);
  });

  it('only enables the machines in the ready phase', () => {
    expect(machinesEnabled(atLiveMachines())).toBe(true);
    expect(machinesEnabled(initialState())).toBe(false);
    expect(machinesEnabled({ ...initialState(), phase: 'booth_picking' })).toBe(false);
    expect(machinesEnabled({ ...initialState(), phase: 'booth_result' })).toBe(false);
  });

  it('raises dread monotonically through the acts', () => {
    const opening = dreadLevel({ ...initialState(), phase: 'menu' });
    const choice = dreadLevel({ ...initialState(), phase: 'choice' });
    const booth = dreadLevel({ ...initialState(), phase: 'booth_ready', rounds: buildRounds('AA', '11') });
    const ending = dreadLevel({ ...initialState(), phase: 'ending' });
    expect(opening).toBeLessThan(choice);
    expect(choice).toBeLessThan(booth);
    expect(booth).toBeLessThan(ending);
    expect(ending).toBeLessThanOrEqual(1);
  });

  it('keeps dread inside 0..1 at every phase', () => {
    const phases: Phase[] = [
      'boot',
      'menu',
      'consent',
      'choice',
      'assessment_active',
      'results_testing',
      'booth_picking',
      'booth_ready',
      'booth_result',
      'ending_loading',
      'ending',
    ];
    for (const phase of phases) {
      const value = dreadLevel({ ...initialState(), phase, plan: plan(), questionIndex: 12 });
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoring', () => {
  it('counts coins and correct calls', () => {
    const rounds = buildRounds('AABBA', '10101', 'AABBB');
    expect(correctCount(rounds)).toBe(4);
    expect(accuracyPercent(rounds)).toBe(80);
  });

  it('returns zero accuracy for an empty game', () => {
    expect(accuracyPercent([])).toBe(0);
  });

  it('identifies the better machine and how often it was chosen', () => {
    expect(betterMachine(0.7, 0.2)).toBe('A');
    expect(betterMachine(0.2, 0.7)).toBe('B');
    expect(optimalChoiceRate(buildRounds('AAAB', '1111'), 'A')).toBeCloseTo(0.75);
    expect(optimalChoiceRate([], 'A')).toBe(0);
  });

  it('measures whether the player became more readable', () => {
    const rounds = buildRounds('AAAABBBB', '11111111', 'BBBBBBBB');
    expect(predictabilityDrift(rounds)).toBeGreaterThan(0);
    expect(predictabilityDrift(buildRounds('AB', '11'))).toBe(0);
  });
});

describe('the booth always opens at zero coins', () => {
  /** Answer the whole assessment, taking rewards along the way. */
  function completeAssessmentWithRewards(): GameState {
    let state = reducer(atChoice(), { type: 'START_ASSESSMENT', plan: plan(), gameId: 'g-abcdefgh' });
    const total = state.plan!.trials.length;
    const records = buildTrials(
      Array.from({ length: total }, () => ({ option: 'one' as const, rewarded: true })),
    );
    records.forEach((record, index) => {
      // Every question pays, so there is plenty of feedback value to leak if it could.
      state = reducer(state, { type: 'RECORD_QUESTION', record: { ...record, index }, coins: 3 });
    });
    return state;
  }

  it('keeps assessment rewards as feedback, entirely out of booth currency', () => {
    const state = completeAssessmentWithRewards();
    const total = state.plan!.trials.length;
    // The rewards were recorded…
    expect(state.assessmentFeedbackValue).toBe(total * 3);
    // …and they are worth nothing in the booth.
    expect(coinsOf(state)).toBe(0);
  });

  it('opens at zero after completing the assessment', () => {
    let state = completeAssessmentWithRewards();
    state = reducer(state, { type: 'PROFILE_DERIVED', profile: neutralProfile() });
    state = reducer(state, { type: 'RESULTS_READY', interpretation: null });
    state = reducer(state, { type: 'ENTER_BOOTH', odds: ODDS });

    expect(state.phase).toBe('booth_picking');
    expect(coinsOf(state)).toBe(0);
  });

  it('opens at zero after skipping the assessment', () => {
    expect(coinsOf(skipped())).toBe(0);
  });

  it('opens at zero on every replay, including after a winning game', () => {
    let state = playToEnding(atLiveMachines());
    // That game was won on every round, so there are coins to carry if they could.
    expect(coinsOf(state)).toBeGreaterThan(0);

    state = reducer(state, { type: 'REPLAY', gameId: 'game-second01', odds: ODDS });
    expect(coinsOf(state)).toBe(0);

    state = playToEnding(state);
    state = reducer(state, { type: 'REPLAY', gameId: 'game-third001', odds: ODDS });
    expect(coinsOf(state)).toBe(0);
  });

  it('still awards booth coins normally once rounds are played', () => {
    let state = atLiveMachines();
    expect(coinsOf(state)).toBe(0);

    state = reducer(state, commit('A', true, true));
    expect(coinsOf(state)).toBe(REWARD_COINS);

    state = reducer(state, { type: 'NEXT_ROUND' });
    state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(state.round) });
    state = reducer(state, commit('A', true, false));
    // A losing round pays nothing.
    expect(coinsOf(state)).toBe(REWARD_COINS);

    state = reducer(state, { type: 'NEXT_ROUND' });
    state = reducer(state, { type: 'PREDICTION_SEALED', ticket: ticket(state.round) });
    state = reducer(state, commit('B', false, true));
    expect(coinsOf(state)).toBe(2 * REWARD_COINS);
  });

  it('keeps assessment rewards feeding win-stay and lose-switch', () => {
    // The whole reason the assessment pays out: the reward flags drive the
    // behavioural maths. Dropping them to zero the coins would destroy the instrument.
    const state = completeAssessmentWithRewards();
    const profile = deriveProfile(state.carriedRecords);

    expect(state.carriedRecords.every((record) => record.rewarded === true)).toBe(true);
    expect(profile.winStayRate.n).toBeGreaterThan(0);
    expect(profile.winStayRate.value).toBeGreaterThan(0.5);

    const losing = deriveProfile(
      buildTrials([
        { option: 'one', rewarded: false },
        { option: 'two', rewarded: false },
        { option: 'one', rewarded: false },
        { option: 'two', rewarded: false },
      ]),
    );
    expect(losing.loseSwitchRate.n).toBeGreaterThan(0);
    expect(losing.loseSwitchRate.value).toBeGreaterThan(0.5);
  });
});
