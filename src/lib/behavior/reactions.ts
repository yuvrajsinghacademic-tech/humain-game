/**
 * Darry's reactions during the assessment.
 *
 * Two words, in a reserved slot above the question. They never pause the game, never
 * take focus and never replace the screen — the next question appears immediately
 * whether a reaction is showing or not, and a reaction may still be fading as it
 * arrives. That is deliberately preferred to interrupting.
 *
 * Fully deterministic in the question index and a seed, so a test or a capture run
 * reproduces exactly the same schedule.
 */

export const REACTIONS = {
  interesting: 'interesting.',
  strange: 'strange.',
} as const;

export type Reaction = (typeof REACTIONS)[keyof typeof REACTIONS];

/** How long a reaction stays on screen. */
export const REACTION_MIN_MS = 900;
export const REACTION_MAX_MS = 1500;

/** Never after the first answer — there is nothing to have reacted to yet. */
const FIRST_ELIGIBLE_INDEX = 2;
/** Minimum questions between reactions, so they stay occasional. */
const MIN_GAP = 3;
/** Roughly how often an eligible question produces one. */
const FREQUENCY = 0.42;
/** Share of reactions that are the rarer word. */
const STRANGE_SHARE = 0.28;

/** Deterministic 0..1 from a pair of integers. */
function hash(index: number, seed: number): number {
  let value = (index + 1) * 2654435761 + seed * 40503;
  value ^= value >>> 13;
  value = Math.imul(value, 1274126177);
  value ^= value >>> 16;
  return ((value >>> 0) % 100000) / 100000;
}

/**
 * The reaction for the question at `index`, or null for silence.
 *
 * The gap rule is applied by walking forward from the start, so the answer for any
 * given index is a pure function of the index and the seed — no running state, and
 * therefore no way for two callers to disagree.
 */
export function reactionAt(index: number, seed: number, total = 24): Reaction | null {
  if (index < FIRST_ELIGIBLE_INDEX) return null;
  if (index >= total) return null;

  let last = -Infinity;
  for (let i = FIRST_ELIGIBLE_INDEX; i <= index; i += 1) {
    if (i - last < MIN_GAP) continue;
    if (hash(i, seed) >= FREQUENCY) continue;
    if (i === index) {
      // `interesting.` is the common one; `strange.` is held back.
      return hash(i, seed + 7717) < STRANGE_SHARE ? REACTIONS.strange : REACTIONS.interesting;
    }
    last = i;
  }
  return null;
}

/** How long this particular reaction is held, deterministically. */
export function reactionDurationMs(index: number, seed: number): number {
  const span = REACTION_MAX_MS - REACTION_MIN_MS;
  return Math.round(REACTION_MIN_MS + hash(index, seed + 331) * span);
}

/** Every index that produces a reaction, for tests and captures. */
export function reactionSchedule(seed: number, total = 24): Array<{ index: number; reaction: Reaction }> {
  const out: Array<{ index: number; reaction: Reaction }> = [];
  for (let index = 0; index < total; index += 1) {
    const reaction = reactionAt(index, seed, total);
    if (reaction) out.push({ index, reaction });
  }
  return out;
}
