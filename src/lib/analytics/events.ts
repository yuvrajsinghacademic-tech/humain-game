/**
 * Product analytics — the funnel, and deliberately nothing else.
 *
 * The question this exists to answer is whether a sticker on Sunset produced anyone
 * who actually finished the game, and whether anyone who finished it shared it.
 * That needs six counters. It does not need to know anything about the person.
 *
 * The rule is enforced structurally rather than by review:
 *
 *  - **The event name must be one of a closed set.** `track` will not accept a
 *    string that is not in `EVENTS`.
 *  - **The properties must be one of a closed set, per event.** A key that is not
 *    declared for that event is dropped before the call is made.
 *  - **Values must be short scalars.** Anything else is dropped.
 *
 * So there is no code path — not a mistake, not a refactor, not a future feature —
 * by which a behavioural profile, a round history, an answer, a verdict, Darry's
 * reasoning or anything identifying can reach an analytics provider. `tests/
 * analytics.test.ts` asserts each of those separately.
 *
 * Which visitor arrived from which campaign is not tracked here at all. That comes
 * from the page path Vercel already records, and the path is the whole mechanism —
 * see `src/lib/campaigns/index.ts`.
 */

import { track as vercelTrack } from '@vercel/analytics';

/**
 * The funnel, in order. A name not on this list cannot be sent.
 *
 * `play_started` fires when the warning is accepted — the point the visitor has
 * actually committed to playing, rather than merely landing.
 */
export const EVENTS = [
  'play_started',
  'assessment_completed',
  'booth_started',
  'game_completed',
  'play_again',
  'share_clicked',
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];

/**
 * The only properties any event may carry, and the only values they may take.
 *
 * An allowlist of *values*, not just of keys: `method` can be `native` or
 * `clipboard` and nothing else, so it can never become a channel for anything
 * derived from the player. Every event that is not listed carries no properties.
 */
const ALLOWED_PROPERTIES: Partial<Record<AnalyticsEvent, Record<string, readonly string[]>>> = {
  share_clicked: { method: ['native', 'clipboard'] },
};

export type AnalyticsProperties = Record<string, string>;

export const isAnalyticsEvent = (name: string): name is AnalyticsEvent =>
  (EVENTS as readonly string[]).includes(name);

/**
 * Strip a property bag down to what this event is allowed to carry.
 *
 * Exported for the test that proves a profile-shaped object survives as `{}`.
 */
export function sanitizeProperties(
  event: AnalyticsEvent,
  properties: AnalyticsProperties | undefined,
): AnalyticsProperties {
  const allowed = ALLOWED_PROPERTIES[event];
  if (!allowed || !properties) return {};

  const out: AnalyticsProperties = {};
  for (const [key, values] of Object.entries(allowed)) {
    const candidate = properties[key];
    if (typeof candidate === 'string' && values.includes(candidate)) out[key] = candidate;
  }
  return out;
}

/**
 * Record one funnel event.
 *
 * Never throws and never blocks. Vercel Web Analytics is absent on localhost and
 * custom events are a plan-dependent feature in production; both are ordinary
 * conditions, not errors, and neither may affect what the player sees. A failure
 * here is swallowed on purpose — an analytics call is not worth a broken ending.
 */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsEvent(event)) return;

  const safe = sanitizeProperties(event, properties);
  try {
    if (Object.keys(safe).length === 0) vercelTrack(event);
    else vercelTrack(event, safe);
  } catch {
    /* analytics is never load-bearing */
  }
}
