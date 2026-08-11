import { describe, expect, it } from 'vitest';
import { MAX_ENDING_CHARS, endingCopy, endingNumbers } from '@/lib/behavior/ending';
import { computeDrift, localDebrief } from '@/lib/behavior/narrative';
import { deriveProfile, summarizeProfile } from '@/lib/behavior/profile';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import type { DebriefReport } from '@/types';
import { buildRounds, buildTrials } from './factories';

const summary = () =>
  summarizeProfile(
    deriveProfile(
      buildTrials([
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'two', rewarded: false },
      ]),
    ),
  );

const report = (finalObservation: string): DebriefReport => ({
  tendencies: ['a', 'b', 'c'],
  paragraph: 'p',
  replacementViability: 60,
  finalObservation,
});

/** Fifteen rounds where `hits` of them were predicted correctly. */
function game(hits: number): ReturnType<typeof buildRounds> {
  const pattern = 'A'.repeat(TOTAL_ROUNDS);
  const predicted = 'A'.repeat(hits) + 'B'.repeat(TOTAL_ROUNDS - hits);
  return buildRounds(pattern, '1'.repeat(TOTAL_ROUNDS), predicted);
}

describe('endingNumbers', () => {
  it("reports Darry's genuine accuracy over the fifteen rounds", () => {
    const numbers = endingNumbers(game(12));
    expect(numbers.correct).toBe(12);
    expect(numbers.rounds).toBe(TOTAL_ROUNDS);
    expect(numbers.darry).toBe(80);
  });

  it('gives the player exactly the remainder', () => {
    for (const hits of [0, 1, 4, 7, 8, 11, 14, 15]) {
      const numbers = endingNumbers(game(hits));
      expect(numbers.you).toBe(100 - numbers.darry);
      expect(numbers.you + numbers.darry).toBe(100);
    }
  });

  it('does not massage a bad result upward', () => {
    const numbers = endingNumbers(game(3));
    expect(numbers.darry).toBe(20);
    expect(numbers.you).toBe(80);
  });

  it('does not cap a perfect read', () => {
    const numbers = endingNumbers(game(15));
    expect(numbers.darry).toBe(100);
    expect(numbers.you).toBe(0);
  });

  it('handles an empty game without inventing a score', () => {
    const numbers = endingNumbers([]);
    expect(numbers.darry).toBe(0);
    expect(numbers.you).toBe(100);
  });
});

describe('endingCopy', () => {
  it('states the real hit count when Darry read the player well', () => {
    const copy = endingCopy(game(12), null);
    expect(copy).toContain('12 of your 15');
    expect(copy.length).toBeLessThanOrEqual(MAX_ENDING_CHARS);
  });

  it('admits Darry has not finished learning when it scored below half', () => {
    const copy = endingCopy(game(5), report('Nothing you did was unavailable to Darry.'));
    expect(copy).toBe('Darry has not finished learning you. It only needs more questions.');
    // It must not claim a win it did not have.
    expect(copy).not.toMatch(/predicted \d+ of/);
  });

  it('never exceeds two short sentences', () => {
    for (const hits of [0, 3, 8, 11, 15]) {
      const copy = endingCopy(game(hits), report('A short closing line from Darry.'));
      expect(copy.length).toBeLessThanOrEqual(MAX_ENDING_CHARS);
      const sentences = copy.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  it("uses Darry's own closing line when it is short enough", () => {
    const copy = endingCopy(game(13), report('You were legible from the third round.'));
    expect(copy).toContain('You were legible from the third round.');
  });

  it('falls back to composed copy when the model rambles', () => {
    const long = 'x'.repeat(400);
    const copy = endingCopy(game(13), report(long));
    expect(copy).not.toContain(long);
    expect(copy.length).toBeLessThanOrEqual(MAX_ENDING_CHARS);
  });

  it('adds a full stop to a model line that lacks one', () => {
    const copy = endingCopy(game(13), report('You never left the left-hand lever'));
    expect(copy).toContain('You never left the left-hand lever.');
  });

  it('describes drift rather than asserting a diagnosis', () => {
    const copy = endingCopy(game(11), null);
    expect(copy).not.toMatch(/disorder|diagnos|condition|therapy|anxiety|depress/i);
  });

  it('reports the direction of drift truthfully', () => {
    // Wrong in the first half, right in the second: they became easier to read.
    const gettingReadable = buildRounds(
      'A'.repeat(TOTAL_ROUNDS),
      '1'.repeat(TOTAL_ROUNDS),
      'BBBBBBBAAAAAAAA',
    );
    expect(endingCopy(gettingReadable, null)).toContain('easier to read');
  });
});

describe('the closing line agrees with the score', () => {
  it('never calls a well-read player unpredictable', () => {
    // Regression: the closer used to be picked by hash, which could put
    // "your unpredictability was itself a stable quantity" over a 73% read.
    for (const accuracy of [0.7, 0.73, 0.8, 0.87, 0.93, 1]) {
      const line = localDebrief({
        profile: summary(),
        accuracy,
        drift: computeDrift(buildRounds('AABB', '1100')),
        rounds: TOTAL_ROUNDS,
      }).finalObservation;
      expect(line.toLowerCase(), `accuracy ${accuracy}`).not.toContain('unpredictability');
      expect(line.toLowerCase()).not.toContain('has not finished');
    }
  });

  it('does not claim total knowledge of a player it failed to read', () => {
    for (const accuracy of [0, 0.13, 0.27, 0.4, 0.47]) {
      const line = localDebrief({
        profile: summary(),
        accuracy,
        drift: computeDrift(buildRounds('AABB', '1100')),
        rounds: TOTAL_ROUNDS,
      }).finalObservation;
      expect(line.toLowerCase(), `accuracy ${accuracy}`).not.toContain('nothing you did was unavailable');
      expect(line.toLowerCase()).not.toContain('before you knew');
    }
  });

  it('keeps every closing line short enough for the ending screen', () => {
    for (const accuracy of [0.1, 0.55, 0.9]) {
      const line = localDebrief({
        profile: summary(),
        accuracy,
        drift: computeDrift(buildRounds('AABB', '1100')),
        rounds: TOTAL_ROUNDS,
      }).finalObservation;
      expect(line.length).toBeLessThanOrEqual(110);
    }
  });
});
