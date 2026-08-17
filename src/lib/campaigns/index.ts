/**
 * Campaign routes.
 *
 * A campaign route is the same game at a second address. A QR code on a sticker in
 * Silver Lake points at `/silverlake`; the visitor plays exactly what a visitor to
 * `/` plays, and the only thing that differs is the line Vercel Web Analytics files
 * the visit under. That is the whole mechanism: **the URL is the tracking**. No
 * query string, no cookie, no identifier, no second analytics provider, and nothing
 * on screen that tells the player where they came from.
 *
 * Two rules make this safe to grow:
 *
 *  1. **One implementation.** Campaign routes resolve to the identical page
 *     component as `/`. They cannot drift, because there is nothing to drift from.
 *  2. **One index.** Every campaign is a row in `CAMPAIGNS` below. Adding a
 *     campaign is adding a row — the route, the metadata, the QR target and the
 *     tests all read from here.
 *
 * See `docs/CAMPAIGNS.md` for the operational side: naming, printing, and how to
 * read the numbers afterwards.
 */

import type { Metadata } from 'next';
import { SITE_URL, absoluteUrl } from '@/lib/site/config';

/** Where the code physically lives. Internal only; never rendered. */
export type CampaignChannel = 'street' | 'campus' | 'social';

export interface Campaign {
  /** The URL path segment, without a slash. Lowercase, `a-z0-9-` only. */
  readonly slug: string;
  readonly channel: CampaignChannel;
  /** Human-readable placement, for reading an analytics table months later. */
  readonly placement: string;
  /**
   * Which physical creative points here, when a placement is running an A/B pair.
   * Separate slugs per creative is the only way to tell two stickers apart — there
   * is no other signal to split on.
   */
  readonly creative?: string;
  /**
   * True when this slug has its own file under `src/app` instead of being served by
   * the shared `[campaign]` route. Only `/linkedin` does, because it predates the
   * shared route and its address is already in circulation.
   */
  readonly ownRoute?: boolean;
}

/**
 * Every campaign address that exists.
 *
 * Order is presentation only. Slugs are permanent once printed: a sticker cannot be
 * edited, so removing a row retires an address that is still on a wall somewhere and
 * turns a real scan into a 404. Retire by leaving the row in place.
 */
export const CAMPAIGNS: readonly Campaign[] = [
  { slug: 'linkedin', channel: 'social', placement: 'LinkedIn posts and profile link', ownRoute: true },

  // Los Angeles street placements. Sunset runs two creatives against each other.
  { slug: 'sunset-a', channel: 'street', placement: 'Sunset Blvd', creative: 'A — WILL YOU BE REPLACED?' },
  { slug: 'sunset-b', channel: 'street', placement: 'Sunset Blvd', creative: "B — AN AI THINKS YOU'RE PREDICTABLE." },
  { slug: 'melrose', channel: 'street', placement: 'Melrose Ave' },
  { slug: 'dtla', channel: 'street', placement: 'Downtown Los Angeles' },
  { slug: 'venice', channel: 'street', placement: 'Venice' },
  { slug: 'silverlake', channel: 'street', placement: 'Silver Lake' },

  // Campus placements.
  { slug: 'usc', channel: 'campus', placement: 'University of Southern California' },
  { slug: 'unlv', channel: 'campus', placement: 'University of Nevada, Las Vegas' },
] as const;

/** The shape a slug must have to be printable, typable and route-safe. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const campaignSlugs = (): string[] => CAMPAIGNS.map((campaign) => campaign.slug);

/**
 * The slugs the shared `[campaign]` route is responsible for.
 *
 * `/linkedin` is excluded because it has its own file. Two routes claiming one path
 * is exactly the kind of ambiguity that resolves differently in development and in
 * production, so the shared route is told about it once, here.
 */
export const sharedCampaignSlugs = (): string[] =>
  CAMPAIGNS.filter((campaign) => !campaign.ownRoute).map((campaign) => campaign.slug);

export function findCampaign(slug: string): Campaign | null {
  return CAMPAIGNS.find((campaign) => campaign.slug === slug) ?? null;
}

export const isCampaignSlug = (slug: string): boolean => findCampaign(slug) !== null;

/** The address a QR code for this campaign must encode, exactly. */
export const campaignUrl = (slug: string): string => absoluteUrl(`/${slug}`);

/**
 * The only difference between a campaign route and `/`, and neither field is visible
 * to a player.
 *
 *  - **canonical** names `/` as the real address, so ranking signals earned by a
 *    campaign URL consolidate onto the homepage instead of competing with it.
 *    Absolute rather than relative so it is unambiguous whatever `metadataBase` does.
 *  - **robots** is `index: false, follow: true` — keep the campaign URL out of the
 *    index, but keep crawling onward through its links.
 *
 * Note what is *not* here: robots.txt does not disallow these paths. A disallowed
 * path is never fetched, so the `noindex` above would never be read, and the URL
 * could still be indexed on the strength of inbound links alone. Crawl it, and let
 * the meta tag do its job.
 *
 * Exactly two keys, so a campaign route inherits its title, description, icon and
 * social preview from the root layout and is byte-identical to `/` in every other
 * respect.
 */
export function campaignMetadata(slug: string): Metadata {
  /*
   * The slug is checked rather than merely accepted. A route file that exists
   * without a matching row in `CAMPAIGNS` would still serve the game, but it would
   * be invisible to the QR generator, the documentation and the tests — a live
   * address nobody knows about. Failing here makes that impossible to do quietly.
   *
   * Development and test only: a production render should never be the first place
   * this is discovered, and a thrown error is not how a live page should react to a
   * bookkeeping mistake.
   */
  if (process.env.NODE_ENV !== 'production' && !isCampaignSlug(slug)) {
    throw new Error(`[campaigns] "${slug}" has no row in CAMPAIGNS (src/lib/campaigns/index.ts).`);
  }

  return {
    alternates: { canonical: `${SITE_URL}/` },
    robots: { index: false, follow: true },
  };
}
