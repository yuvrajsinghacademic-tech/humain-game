import { describe, expect, it } from 'vitest';
import {
  TRIAL_COUNT,
  TRIAL_SCRIPT,
  buildCalibrationPlan,
  resolveTrialReward,
} from '@/lib/behavior/trials';
import { HIGH_ODDS_RANGE, LOW_ODDS_RANGE } from '@/lib/behavior/scoring';
import { balancedSchedule, mulberry32, randomBetween, shuffle } from '@/lib/behavior/rng';

const plans = (count: number) =>
  Array.from({ length: count }, (_, seed) => buildCalibrationPlan(mulberry32(seed + 1)));

describe('trial script', () => {
  it('is about twenty-four trials', () => {
    expect(TRIAL_COUNT).toBe(24);
    expect(TRIAL_SCRIPT).toHaveLength(24);
  });

  it('covers every measurement family the profile needs', () => {
    const categories = new Set(TRIAL_SCRIPT.map((t) => t.category));
    expect(categories).toEqual(new Set(['bias', 'bandit', 'sequence', 'risk', 'pressure', 'reactance']));
  });

  it('includes rewarded learning questions, wagers, timed questions and pattern claims', () => {
    expect(TRIAL_SCRIPT.filter((t) => t.feedback === 'channel').length).toBeGreaterThanOrEqual(12);
    expect(TRIAL_SCRIPT.filter((t) => t.feedback === 'wager')).toHaveLength(4);
    expect(TRIAL_SCRIPT.filter((t) => t.deadlineMs)).toHaveLength(2);
    expect(TRIAL_SCRIPT.filter((t) => t.patternClaim).length).toBeGreaterThanOrEqual(2);
  });

  it('carries no instructional prose at all', () => {
    // The correction pass removed every directive: a question is two options and a
    // counter, nothing more. This guards against prose creeping back in.
    for (const trial of TRIAL_SCRIPT) {
      const fields = Object.keys(trial);
      expect(fields).not.toContain('directive');
      expect(fields).not.toContain('notice');
      expect(fields).not.toContain('prompt');
      // Option labels are accessible names only, and must not read as questions.
      for (const option of trial.options) {
        expect(option.label).not.toMatch(/\bare you\b|\bdo you\b|\bwould you\b|\byour personality\b/i);
        expect(option.label.length).toBeLessThanOrEqual(24);
      }
    }
  });

  it('places the first pattern claim after enough questions to have a habit to name', () => {
    const first = TRIAL_SCRIPT.findIndex((t) => Boolean(t.patternClaim));
    expect(first).toBeGreaterThan(8);
  });

  it('keeps every learning block on its own block id', () => {
    const blocks = new Set(TRIAL_SCRIPT.map((t) => t.block));
    expect(blocks.has('chan-a')).toBe(true);
    expect(blocks.has('chan-b')).toBe(true);
    // Repeat/switch is computed within a block, so a bandit trial must never share
    // a block with a risk or sequence trial.
    const perBlock = new Map<string, Set<string>>();
    for (const trial of TRIAL_SCRIPT) {
      const set = perBlock.get(trial.block) ?? new Set<string>();
      set.add(trial.feedback ?? 'none');
      perBlock.set(trial.block, set);
    }
    for (const feedbacks of perBlock.values()) {
      expect(feedbacks.size).toBe(1);
    }
  });
});

describe('left/right counterbalancing', () => {
  it('splits placement evenly within every block, for every seed', () => {
    for (const plan of plans(25)) {
      const byBlock = new Map<string, boolean[]>();
      for (const trial of plan.trials) {
        const list = byBlock.get(trial.block) ?? [];
        list.push(trial.flipped);
        byBlock.set(trial.block, list);
      }
      for (const [block, flips] of byBlock) {
        const flipped = flips.filter(Boolean).length;
        // A balanced schedule: at most one trial of imbalance, from an odd count.
        expect(Math.abs(flipped - (flips.length - flipped)), `${block}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not degenerate into strict alternation, which would fake an alternator', () => {
    // If placement alternated every trial, a player who always clicks left would
    // look like a perfect alternator. Across seeds some blocks must repeat.
    const runs = plans(20).map((plan) => {
      const chanA = plan.trials.filter((t) => t.block === 'chan-a').map((t) => t.flipped);
      return chanA.some((value, index) => index > 0 && value === chanA[index - 1]);
    });
    expect(runs.some(Boolean)).toBe(true);
  });

  it('varies placement across playthroughs', () => {
    const signatures = new Set(plans(12).map((plan) => plan.trials.map((t) => Number(t.flipped)).join('')));
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('keeps canonical option identity stable while display order moves', () => {
    for (const plan of plans(6)) {
      plan.trials.forEach((trial, index) => {
        const canonical = TRIAL_SCRIPT[index].options.map((o) => o.id).sort();
        const shown = trial.displayed.map((o) => o.id).sort();
        expect(shown).toEqual(canonical);
        if (trial.flipped) expect(trial.displayed[0].id).toBe(TRIAL_SCRIPT[index].options[1].id);
        else expect(trial.displayed[0].id).toBe(TRIAL_SCRIPT[index].options[0].id);
      });
    }
  });
});

describe('hidden channel odds', () => {
  it('gives each learning block one generous and one stingy channel', () => {
    for (const plan of plans(20)) {
      for (const block of ['chan-a', 'chan-b']) {
        const one = plan.channelOdds[`${block}:one`];
        const two = plan.channelOdds[`${block}:two`];
        expect(Math.max(one, two)).toBeGreaterThan(0.6);
        expect(Math.min(one, two)).toBeLessThan(0.4);
      }
    }
  });

  it('assigns the better channel to either side across playthroughs', () => {
    const highSides = new Set(
      plans(20).map((plan) => (plan.channelOdds['chan-a:one'] > plan.channelOdds['chan-a:two'] ? 'one' : 'two')),
    );
    // A fixed assignment would let a glyph preference masquerade as reward learning.
    expect(highSides.size).toBe(2);
  });

  it('never exposes the odds through the prepared trials', () => {
    const plan = buildCalibrationPlan(mulberry32(4));
    expect(JSON.stringify(plan.trials)).not.toContain('channelOdds');
    for (const trial of plan.trials) {
      expect(JSON.stringify(trial)).not.toMatch(/0\.\d{3,}/);
    }
  });
});

describe('resolveTrialReward', () => {
  it('pays a channel at roughly its hidden rate', () => {
    const plan = buildCalibrationPlan(mulberry32(9));
    const generous =
      plan.channelOdds['chan-a:one'] > plan.channelOdds['chan-a:two'] ? 'chan-a:one' : 'chan-a:two';
    const trial = plan.trials.find((t) => t.block === 'chan-a')!;

    const rng = mulberry32(123);
    let paid = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i += 1) {
      if (resolveTrialReward(trial, generous, plan, rng).rewarded) paid += 1;
    }
    expect(paid / runs).toBeCloseTo(plan.channelOdds[generous], 1);
  });

  it('always pays the fixed option in a wager and sometimes pays the variable one', () => {
    const plan = buildCalibrationPlan(mulberry32(3));
    const wager = plan.trials.find((t) => t.feedback === 'wager')!;
    const rng = mulberry32(77);

    const safe = resolveTrialReward(wager, 'risk:safe', plan, rng);
    expect(safe.rewarded).toBe(true);
    expect(safe.coins).toBe(wager.wager!.safe);

    let wins = 0;
    for (let i = 0; i < 500; i += 1) {
      if (resolveTrialReward(wager, 'risk:risky', plan, rng).rewarded) wins += 1;
    }
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(500);
  });

  it('reports no reward at all for an unrewarded trial', () => {
    const plan = buildCalibrationPlan(mulberry32(3));
    const free = plan.trials.find((t) => t.feedback === null)!;
    const result = resolveTrialReward(free, free.displayed[0].id, plan, mulberry32(1));
    expect(result.rewarded).toBeNull();
    expect(result.coins).toBe(0);
  });
});

describe('rng utilities', () => {
  it('is reproducible for a seed and different across seeds', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const c = mulberry32(6);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  it('stays inside the unit interval', () => {
    const rng = mulberry32(17);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces values inside the requested range', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 500; i += 1) {
      const high = randomBetween(rng, HIGH_ODDS_RANGE[0], HIGH_ODDS_RANGE[1]);
      const low = randomBetween(rng, LOW_ODDS_RANGE[0], LOW_ODDS_RANGE[1]);
      expect(high).toBeGreaterThanOrEqual(HIGH_ODDS_RANGE[0]);
      expect(high).toBeLessThan(HIGH_ODDS_RANGE[1]);
      expect(low).toBeGreaterThanOrEqual(LOW_ODDS_RANGE[0]);
      expect(low).toBeLessThan(LOW_ODDS_RANGE[1]);
    }
  });

  it('shuffles without losing or duplicating items', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(mulberry32(2), input);
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('builds a balanced boolean schedule', () => {
    for (const count of [2, 3, 4, 8, 9, 24]) {
      const schedule = balancedSchedule(mulberry32(count), count);
      expect(schedule).toHaveLength(count);
      const trues = schedule.filter(Boolean).length;
      expect(trues).toBe(Math.ceil(count / 2));
    }
  });
});
