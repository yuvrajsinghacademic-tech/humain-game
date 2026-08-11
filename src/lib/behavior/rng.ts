/**
 * Deterministic pseudo-random number generation.
 *
 * The game needs randomness in three places — which machine gets the good odds,
 * whether a pull pays out, and the local predictor's tie-break. All three go
 * through an injectable `Rng` so the end-to-end test can pin them.
 */

export type Rng = () => number;

/** mulberry32. Small, fast, good enough for a game; not for cryptography. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unseeded production randomness. */
export const systemRng: Rng = () => Math.random();

/** Uniform float in `[min, max)`. */
export function randomBetween(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/** Fisher–Yates, using the supplied `Rng`. Returns a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A balanced boolean schedule: exactly `ceil(count/2)` true values, shuffled.
 *
 * Used to counterbalance left/right placement. A strictly alternating schedule
 * would make a position-biased player look like an alternator, and a purely
 * random one can drift; a balanced shuffle avoids both.
 */
export function balancedSchedule(rng: Rng, count: number): boolean[] {
  const flags: boolean[] = [];
  for (let i = 0; i < count; i += 1) flags.push(i < Math.ceil(count / 2));
  return shuffle(rng, flags);
}
