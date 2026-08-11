import { describe, expect, it } from 'vitest';
import {
  annotateTrial,
  clamp01,
  deriveProfile,
  estimate,
  neutralProfile,
  roundsToTrialRecords,
  summarizeProfile,
  type RawTrialCapture,
} from '@/lib/behavior/profile';
import { buildRounds, buildTrials } from './factories';

describe('estimate smoothing', () => {
  it('never returns 0 or 1 from a small sample', () => {
    const allHits = estimate(3, 3);
    const allMisses = estimate(0, 3);
    expect(allHits.value).toBeLessThan(1);
    expect(allHits.value).toBeGreaterThan(0.5);
    expect(allMisses.value).toBeGreaterThan(0);
    expect(allMisses.value).toBeLessThan(0.5);
  });

  it('sits exactly on the prior with no observations', () => {
    const none = estimate(0, 0);
    expect(none.value).toBe(0.5);
    expect(none.confidence).toBe(0);
  });

  it('converges toward the raw rate as evidence accumulates', () => {
    const small = estimate(8, 8).value;
    const large = estimate(200, 200).value;
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(0.95);
    expect(large).toBeLessThan(1);
  });

  it('reports confidence that rises monotonically with sample size', () => {
    expect(estimate(1, 2).confidence).toBeLessThan(estimate(5, 10).confidence);
    expect(estimate(5, 10).confidence).toBeLessThan(estimate(50, 100).confidence);
    expect(estimate(50, 100).confidence).toBeLessThan(1);
  });

  it('clamps non-finite input to the prior', () => {
    expect(clamp01(Number.NaN)).toBe(0.5);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(9)).toBe(1);
  });
});

describe('annotateTrial', () => {
  const base: RawTrialCapture = {
    trialId: 't',
    index: 0,
    category: 'bandit',
    block: 'chan-a',
    optionOrder: ['chan-a:one', 'chan-a:two'],
    chosenOptionId: 'chan-a:one',
    chosenPosition: 'left',
    responseMs: 500,
    timedOut: false,
    rewarded: true,
    afterPatternNotice: false,
    riskyChosen: null,
  };

  it('marks the first trial in a block as having no relation', () => {
    const record = annotateTrial([], base);
    expect(record.relation).toBe('none');
    expect(record.priorOutcome).toBe('none');
  });

  it('distinguishes repeat from switch', () => {
    const first = annotateTrial([], base);
    const repeat = annotateTrial([first], { ...base, index: 1 });
    const switched = annotateTrial([first, repeat], {
      ...base,
      index: 2,
      chosenOptionId: 'chan-a:two',
    });
    expect(repeat.relation).toBe('repeat');
    expect(switched.relation).toBe('switch');
  });

  it('does not carry relation across blocks', () => {
    const first = annotateTrial([], base);
    const otherBlock = annotateTrial([first], {
      ...base,
      index: 1,
      block: 'chan-b',
      chosenOptionId: 'chan-b:one',
      optionOrder: ['chan-b:one', 'chan-b:two'],
    });
    expect(otherBlock.relation).toBe('none');
  });

  it('counts consecutive identical outcomes as a streak', () => {
    const records = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: false },
    ]);
    expect(records[2].priorOutcomeStreak).toBe(2);
    expect(records[3].priorOutcomeStreak).toBe(3);
    expect(records[3].priorOutcome).toBe('win');
  });
});

describe('deriveProfile', () => {
  it('returns a fully neutral profile with no trials', () => {
    const profile = neutralProfile();
    expect(profile.winStayRate.value).toBe(0.5);
    expect(profile.loseSwitchRate.value).toBe(0.5);
    expect(profile.trials).toBe(0);
    expect(profile.meanDecisionMs).toBeGreaterThan(0);
  });

  it('detects win-stay behaviour', () => {
    // Always repeats after a win, always switches after a loss.
    const records = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: true },
    ]);
    const profile = deriveProfile(records);
    expect(profile.winStayRate.value).toBeGreaterThan(0.7);
    expect(profile.winStayRate.n).toBeGreaterThan(2);
  });

  it('detects lose-switch behaviour', () => {
    const records = buildTrials([
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: false },
    ]);
    const profile = deriveProfile(records);
    expect(profile.loseSwitchRate.value).toBeGreaterThan(0.7);
  });

  it('separates alternation from win-stay', () => {
    const alternating = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
    ]);
    const profile = deriveProfile(alternating);
    expect(profile.alternationRate.value).toBeGreaterThan(0.75);
    // Every prior outcome was a win and they still left, so win-stay must be low.
    expect(profile.winStayRate.value).toBeLessThan(0.3);
  });

  it('scores exploration when the worse-looking option is chosen', () => {
    // "one" is visibly better after the first two trials, yet "two" keeps being taken.
    const records = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: false },
      { option: 'two', rewarded: false },
      { option: 'two', rewarded: false },
      { option: 'two', rewarded: false },
    ]);
    const profile = deriveProfile(records);
    expect(profile.explorationRate.value).toBeGreaterThan(0.6);
    expect(profile.explorationRate.n).toBeGreaterThan(0);
  });

  it('scores low exploration for a greedy player', () => {
    const records = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
    ]);
    const profile = deriveProfile(records);
    expect(profile.explorationRate.value).toBeLessThan(0.4);
  });

  it('measures risk appetite only from wager trials', () => {
    const records = buildTrials([
      { block: 'risk', category: 'risk', option: 'two', rewarded: true, risky: true },
      { block: 'risk', category: 'risk', option: 'two', rewarded: false, risky: true },
      { block: 'risk', category: 'risk', option: 'two', rewarded: true, risky: true },
      { block: 'risk', category: 'risk', option: 'one', rewarded: true, risky: false },
    ]);
    const profile = deriveProfile(records);
    expect(profile.riskRate.n).toBe(4);
    expect(profile.riskRate.value).toBeGreaterThan(0.5);
  });

  it('measures position bias independently of option identity', () => {
    // Always the left button, but counterbalancing means that is sometimes
    // option one and sometimes option two.
    const records = buildTrials([
      { option: 'one', position: 'left', rewarded: true },
      { option: 'two', position: 'left', rewarded: true },
      { option: 'one', position: 'left', rewarded: false },
      { option: 'two', position: 'left', rewarded: true },
    ]);
    const profile = deriveProfile(records);
    expect(profile.leftBias.value).toBeGreaterThan(0.7);
  });

  it('reports a neutral position bias under balanced placement', () => {
    const records = buildTrials([
      { option: 'one', position: 'left', rewarded: true },
      { option: 'one', position: 'right', rewarded: true },
      { option: 'two', position: 'left', rewarded: true },
      { option: 'two', position: 'right', rewarded: true },
    ]);
    expect(deriveProfile(records).leftBias.value).toBeCloseTo(0.5, 5);
  });

  it('computes hesitation as switch latency minus repeat latency', () => {
    const records = buildTrials([
      { option: 'one', rewarded: true, responseMs: 400 },
      { option: 'one', rewarded: true, responseMs: 400 },
      { option: 'two', rewarded: true, responseMs: 1400 },
      { option: 'one', rewarded: true, responseMs: 1400 },
    ]);
    const profile = deriveProfile(records);
    expect(profile.repeatDecisionMs).toBe(400);
    expect(profile.switchDecisionMs).toBe(1400);
    expect(profile.hesitationDeltaMs).toBe(1000);
    expect(profile.meanDecisionMs).toBe(900);
  });

  it('ignores timed-out trials entirely', () => {
    const withTimeout = buildTrials([
      { option: 'one', rewarded: true, responseMs: 500 },
      { option: 'two', rewarded: true, responseMs: 9999, timedOut: true },
    ]);
    const profile = deriveProfile(withTimeout);
    // The timed-out trial must not drag the latency or the position tally.
    expect(profile.meanDecisionMs).toBe(500);
    expect(profile.leftBias.n).toBe(1);
    expect(profile.trials).toBe(2);
  });

  it('reads reactance as a change in switching after the notice', () => {
    const records = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true, afterNotice: true, category: 'reactance' },
      { option: 'one', rewarded: true, afterNotice: true, category: 'reactance' },
      { option: 'two', rewarded: true, afterNotice: true, category: 'reactance' },
    ]);
    const profile = deriveProfile(records);
    expect(profile.reactanceRate.value).toBeGreaterThan(0.5);
    expect(profile.reactanceRate.n).toBe(3);
  });

  it('rates a rule-following player as more consistent than a mixed one', () => {
    const consistent = deriveProfile(
      buildTrials([
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
      ]),
    );
    const mixed = deriveProfile(
      buildTrials([
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: false },
        { option: 'two', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: false },
        { option: 'two', rewarded: false },
      ]),
    );
    expect(consistent.consistencyScore.value).toBeGreaterThan(mixed.consistencyScore.value);
  });
});

describe('roundsToTrialRecords', () => {
  it('turns Act II rounds into channel trials with correct relations', () => {
    const records = roundsToTrialRecords(buildRounds('AABB', '1010'), 24);
    expect(records).toHaveLength(4);
    expect(records[0].relation).toBe('none');
    expect(records[1].relation).toBe('repeat');
    expect(records[2].relation).toBe('switch');
    expect(records[0].index).toBe(25);
    expect(records[0].chosenPosition).toBe('left');
    expect(records[2].chosenPosition).toBe('right');
  });

  it('lets booth play sharpen the profile derived from calibration', () => {
    const calibration = buildTrials([
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
    ]);
    const before = deriveProfile(calibration);
    const after = deriveProfile([
      ...calibration,
      ...roundsToTrialRecords(buildRounds('AAAAAAAA', '11111111'), calibration.length),
    ]);
    expect(after.winStayRate.n).toBeGreaterThan(before.winStayRate.n);
    expect(after.winStayRate.confidence).toBeGreaterThan(before.winStayRate.confidence);
  });
});

describe('summarizeProfile', () => {
  it('rounds to two decimals and carries no identifying data', () => {
    const summary = summarizeProfile(
      deriveProfile(
        buildTrials([
          { option: 'one', rewarded: true },
          { option: 'one', rewarded: true },
          { option: 'two', rewarded: false },
        ]),
      ),
    );
    for (const value of Object.values(summary)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(summary.winStay).toBe(Math.round(summary.winStay * 100) / 100);
    expect(summary.trials).toBe(3);
    expect(Object.keys(summary)).not.toContain('trialRecords');
    expect(summary.evidence).toBeGreaterThanOrEqual(0);
    expect(summary.evidence).toBeLessThanOrEqual(1);
  });
});
