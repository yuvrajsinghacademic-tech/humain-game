/**
 * The share text.
 *
 * Composed on the device, from four integers that are already on the screen in front
 * of the player: how many of their fifteen choices Darry called, and the two
 * percentages. Nothing is uploaded, nothing is stored, and no result page is created
 * — there is no server involved in sharing at all, so there is no record of a share
 * anywhere and nothing to leak.
 *
 * What is deliberately not in the string: which side they picked in any round, how
 * long they took, anything derived from the behavioural profile, anything Darry
 * concluded about them, and the closing line the game wrote for them. Those are the
 * private part of the experience. `tests/share.test.ts` asserts it directly, against
 * a result object carrying planted secrets.
 *
 * Pure and synchronous, so the same string can be asserted in a unit test and handed
 * to `navigator.share` without a second code path.
 */

import { SITE_URL } from '@/lib/site/config';

export interface ShareableResult {
  /** Darry's accuracy over the game, as a whole percentage. */
  darry: number;
  /** Exactly the remainder. */
  you: number;
  /** Rounds Darry called correctly. */
  correct: number;
  /** Rounds played. */
  rounds: number;
}

/** The address a share sends people to — the homepage, never a campaign route. */
export const SHARE_URL = `${SITE_URL}/`;
/** The same address as a person would write it. */
export const SHARE_DOMAIN = 'willyoubereplaced.com';

/** Title for the native share sheet. Some targets show it, most ignore it. */
export const SHARE_TITLE = 'hum(ai)n';

const clamp = (value: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), max) : 0;

/**
 * Two sentences and a domain.
 *
 * The second sentence is the invitation, and it is the reason the first one is a
 * number rather than a verdict: `Darry predicted 11 of my 15 choices` is a score
 * somebody can beat, where `you will be replaced` is only an ending.
 */
export function shareText(result: ShareableResult): string {
  const rounds = clamp(result.rounds, 999);
  const correct = clamp(result.correct, rounds);
  const darry = clamp(result.darry, 100);

  return [
    `Darry predicted ${correct} of my ${rounds} choices in hum(ai)n — ${darry}% of me.`,
    `Think you are harder to read?`,
    SHARE_DOMAIN,
  ].join('\n\n');
}

/** What goes on the clipboard: the text, then the full address to click. */
export function shareClipboardText(result: ShareableResult): string {
  return `${shareText(result)}\n${SHARE_URL}`;
}

/** The payload for `navigator.share`. */
export function shareData(result: ShareableResult): {
  title: string;
  text: string;
  url: string;
} {
  return { title: SHARE_TITLE, text: shareText(result), url: SHARE_URL };
}
