import { describe, expect, it } from 'vitest';
import {
  REACTIONS,
  REACTION_MAX_MS,
  REACTION_MIN_MS,
  reactionAt,
  reactionDurationMs,
  reactionSchedule,
} from '@/lib/behavior/reactions';

const TOTAL = 24;

describe('the reaction vocabulary', () => {
  it('offers only the two permitted words', () => {
    expect(Object.values(REACTIONS)).toEqual(['interesting.', 'strange.']);
  });

  it('is lowercase', () => {
    for (const word of Object.values(REACTIONS)) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  it('never produces any of the removed interruption phrases', () => {
    const banned = [
      'you switched.',
      'pattern forming.',
      'you changed your answer.',
      'that was different.',
      'again.',
      'you hesitated.',
      'darry noticed.',
      'darry expected that.',
    ];
    for (let seed = 0; seed < 200; seed += 1) {
      for (const { reaction } of reactionSchedule(seed, TOTAL)) {
        expect(banned).not.toContain(reaction);
      }
    }
  });
});

describe('scheduling', () => {
  it('says nothing about the first two answers', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(reactionAt(0, seed, TOTAL)).toBeNull();
      expect(reactionAt(1, seed, TOTAL)).toBeNull();
    }
  });

  it('does not react after every answer', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const schedule = reactionSchedule(seed, TOTAL);
      expect(schedule.length).toBeLessThan(TOTAL / 2);
    }
  });

  it('reacts at least a couple of times across an assessment', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      expect(reactionSchedule(seed, TOTAL).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves at least three questions between reactions', () => {
    for (let seed = 0; seed < 80; seed += 1) {
      const indexes = reactionSchedule(seed, TOTAL).map((entry) => entry.index);
      for (let i = 1; i < indexes.length; i += 1) {
        expect(indexes[i] - indexes[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is irregular rather than metronomic', () => {
    const gaps = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const indexes = reactionSchedule(seed, TOTAL).map((entry) => entry.index);
      for (let i = 1; i < indexes.length; i += 1) gaps.add(indexes[i] - indexes[i - 1]);
    }
    expect(gaps.size).toBeGreaterThan(1);
  });

  it('never reacts past the end of the assessment', () => {
    expect(reactionAt(TOTAL, 1, TOTAL)).toBeNull();
    expect(reactionAt(TOTAL + 5, 1, TOTAL)).toBeNull();
  });
});

describe('rarity', () => {
  it('makes "interesting." clearly the common one', () => {
    let interesting = 0;
    let strange = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      for (const { reaction } of reactionSchedule(seed, TOTAL)) {
        if (reaction === REACTIONS.interesting) interesting += 1;
        else strange += 1;
      }
    }
    expect(interesting).toBeGreaterThan(strange);
    // …and "strange." still appears, so it is rare rather than absent.
    expect(strange).toBeGreaterThan(0);
    expect(strange / (interesting + strange)).toBeLessThan(0.45);
  });
});

describe('determinism', () => {
  it('gives the same schedule for the same seed', () => {
    expect(reactionSchedule(1234, TOTAL)).toEqual(reactionSchedule(1234, TOTAL));
  });

  it('gives different schedules for different seeds', () => {
    const a = JSON.stringify(reactionSchedule(1, TOTAL));
    const different = [2, 3, 4, 5, 6].some((seed) => JSON.stringify(reactionSchedule(seed, TOTAL)) !== a);
    expect(different).toBe(true);
  });

  it('is a pure function of index and seed, with no running state', () => {
    // Asking out of order must give the same answers as asking in order.
    const forwards = Array.from({ length: TOTAL }, (_, i) => reactionAt(i, 55, TOTAL));
    const backwards = Array.from({ length: TOTAL }, (_, i) => TOTAL - 1 - i)
      .map((i) => ({ i, value: reactionAt(i, 55, TOTAL) }))
      .sort((a, b) => a.i - b.i)
      .map((entry) => entry.value);
    expect(backwards).toEqual(forwards);
  });

  it('holds each reaction inside the permitted window', () => {
    for (let index = 0; index < TOTAL; index += 1) {
      const duration = reactionDurationMs(index, 9);
      expect(duration).toBeGreaterThanOrEqual(REACTION_MIN_MS);
      expect(duration).toBeLessThanOrEqual(REACTION_MAX_MS);
    }
  });

  it('gives the same duration for the same index and seed', () => {
    expect(reactionDurationMs(5, 9)).toBe(reactionDurationMs(5, 9));
  });
});
