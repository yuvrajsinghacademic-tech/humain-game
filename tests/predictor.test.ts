import { describe, expect, it } from 'vitest';
import {
  describeDominantTraits,
  observedRate,
  predictLocally,
  trailingChoiceRun,
  trailingOutcomeStreak,
} from '@/lib/behavior/predictor';
import { deriveProfile, neutralProfile } from '@/lib/behavior/profile';
import { mulberry32 } from '@/lib/behavior/rng';
import { buildRounds, buildTrials } from './factories';

/**
 * A textbook win-stay/lose-shift player: repeats after every payout, leaves after
 * every miss, with both halves equally well evidenced and no positional lean.
 *
 * The evidence balance matters. An earlier version of this fixture had eight
 * observations of "does not alternate" against two of "switches after a loss", and
 * the predictor correctly preferred the better-evidenced signal — the confidence
 * weighting is the point, so the fixture has to be fair to both traits.
 */
const wslsProfile = () =>
  deriveProfile(
    buildTrials([
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: true },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: true },
      { option: 'two', rewarded: false },
      { option: 'one', rewarded: true },
      { option: 'one', rewarded: false },
      { option: 'two', rewarded: true },
      { option: 'two', rewarded: false },
    ]),
  );

const alternatorProfile = () =>
  deriveProfile(
    buildTrials([
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
      { option: 'one', rewarded: true },
      { option: 'two', rewarded: true },
    ]),
  );

describe('history helpers', () => {
  it('measures the trailing outcome streak', () => {
    expect(trailingOutcomeStreak(buildRounds('AAAA', '0111'))).toBe(3);
    expect(trailingOutcomeStreak(buildRounds('AAAA', '1110'))).toBe(1);
    expect(trailingOutcomeStreak([])).toBe(0);
  });

  it('measures the trailing run of identical choices', () => {
    expect(trailingChoiceRun(buildRounds('ABBB', '1111'))).toBe(3);
    expect(trailingChoiceRun(buildRounds('BBBA', '1111'))).toBe(1);
    expect(trailingChoiceRun([])).toBe(0);
  });

  it('reports the observed payout rate per machine, or null when unpulled', () => {
    const history = buildRounds('AAB', '101');
    expect(observedRate(history, 'A')).toBeCloseTo(0.5);
    expect(observedRate(history, 'B')).toBe(1);
    expect(observedRate(buildRounds('AA', '11'), 'B')).toBeNull();
  });
});

describe('predictLocally', () => {
  it('expects a win-stay player to stay after a payout', () => {
    const result = predictLocally({
      profile: wslsProfile(),
      history: buildRounds('AAA', '111'),
      round: 4,
      rng: mulberry32(1),
    });
    expect(result.prediction).toBe('A');
    expect(result.weakEvidence).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('expects a win-stay player to leave after a miss', () => {
    const result = predictLocally({
      profile: wslsProfile(),
      history: buildRounds('AAA', '110'),
      round: 4,
      rng: mulberry32(1),
    });
    expect(result.prediction).toBe('B');
  });

  it('expects an alternator to switch even after winning', () => {
    const result = predictLocally({
      profile: alternatorProfile(),
      history: buildRounds('ABAB', '1111'),
      round: 5,
      rng: mulberry32(7),
    });
    expect(result.prediction).toBe('A');
  });

  it('caps confidence below certainty', () => {
    const result = predictLocally({
      profile: wslsProfile(),
      history: buildRounds('AAAAAAAA', '11111111'),
      round: 9,
      rng: mulberry32(3),
    });
    expect(result.confidence).toBeLessThanOrEqual(0.92);
  });

  it('is deterministic for a given profile, history and seed', () => {
    const input = {
      profile: wslsProfile(),
      history: buildRounds('AB', '10'),
      round: 3,
    };
    const first = predictLocally({ ...input, rng: mulberry32(42) });
    const second = predictLocally({ ...input, rng: mulberry32(42) });
    expect(first).toEqual(second);
  });

  it('flags weak evidence on the very first round of a neutral profile', () => {
    const result = predictLocally({
      profile: neutralProfile(),
      history: [],
      round: 1,
      rng: mulberry32(5),
    });
    expect(result.weakEvidence).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it('never silently defaults to A when evidence is weak', () => {
    // Sweep many seeds through the weak-evidence branch: both outcomes must appear,
    // which is the property that stops a broken fallback from looking like a model.
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      const result = predictLocally({
        profile: neutralProfile(),
        history: [],
        round: 1,
        rng: mulberry32(seed),
      });
      expect(result.weakEvidence).toBe(true);
      seen.add(result.prediction);
    }
    expect(seen.has('A')).toBe(true);
    expect(seen.has('B')).toBe(true);
  });

  it('splits weak-evidence predictions roughly evenly across seeds', () => {
    let aCount = 0;
    const trials = 400;
    for (let seed = 0; seed < trials; seed += 1) {
      const result = predictLocally({
        profile: neutralProfile(),
        history: [],
        round: 1,
        rng: mulberry32(seed * 7919),
      });
      if (result.prediction === 'A') aCount += 1;
    }
    const share = aCount / trials;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });

  it('leans on a measured position preference when nothing else is known', () => {
    const leftLeaning = deriveProfile(
      buildTrials(
        Array.from({ length: 16 }, () => ({
          option: 'one' as const,
          position: 'left' as const,
          rewarded: null,
          category: 'bias' as const,
          block: 'bias',
        })),
      ),
    );
    const result = predictLocally({
      profile: leftLeaning,
      history: [],
      round: 1,
      rng: mulberry32(11),
    });
    // A holds the left position in the booth.
    expect(result.prediction).toBe('A');
    expect(result.weakEvidence).toBe(false);
  });

  it('keeps the explanation within twelve words', () => {
    const result = predictLocally({
      profile: wslsProfile(),
      history: buildRounds('AAB', '110'),
      round: 4,
      rng: mulberry32(2),
    });
    expect(result.reasoning.trim().split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(result.source).toBe('local');
  });

  it('follows the machine that has actually been paying', () => {
    // A profile with no habit to speak of, but B has paid every time.
    const flat = neutralProfile();
    const result = predictLocally({
      profile: flat,
      history: buildRounds('ABBB', '0111'),
      round: 5,
      rng: mulberry32(9),
    });
    expect(result.prediction).toBe('B');
  });
});

describe('describeDominantTraits', () => {
  it('surfaces three traits, strongest first', () => {
    const traits = describeDominantTraits(wslsProfile());
    expect(traits).toHaveLength(3);
    expect(new Set(traits).size).toBe(3);
    traits.forEach((trait) => expect(trait.length).toBeGreaterThan(0));
  });

  it('still returns three traits for a neutral profile', () => {
    expect(describeDominantTraits(neutralProfile())).toHaveLength(3);
  });
});
