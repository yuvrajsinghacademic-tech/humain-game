/**
 * Every campaign address, served by one route.
 *
 * `/sunset-a`, `/melrose`, `/usc` and the rest all resolve here, and here re-exports
 * the root page component — so a campaign URL is not *like* the game, it *is* the
 * game, by reference. There is no second implementation to keep in step, and a
 * change to `/` reaches all nine addresses in the same edit.
 *
 * Three things make this safe to leave at the root of the route tree:
 *
 *  - **`dynamicParams = false`.** Only the slugs listed in `CAMPAIGNS` exist.
 *    Anything else is a 404, exactly as it was before this route was added, so this
 *    is not a catch-all that quietly swallows typos and dead links.
 *  - **Static segments win.** `/about`, `/privacy`, `/api/*` and the metadata routes
 *    are literal segments and are matched before a dynamic one is considered.
 *    `/linkedin` keeps its own file for the same reason it always had one, and is
 *    excluded from the params below so two routes never claim one path.
 *  - **Prerendered.** Each slug is generated at build time, so a campaign URL is a
 *    static document — which matters when a few hundred people scan a sticker at
 *    once.
 *
 * The address is never rewritten or redirected. That is the entire measurement:
 * Vercel Web Analytics records the path that actually rendered, so a visit filed
 * under `/melrose` is a person who scanned the code on Melrose. Nothing else is
 * needed, and nothing else is collected — no query string, no cookie, no identifier,
 * and nothing on screen that mentions where the player came from.
 */

import type { Metadata } from 'next';
import { campaignMetadata, sharedCampaignSlugs } from '@/lib/campaigns';

export const dynamicParams = false;

export function generateStaticParams(): Array<{ campaign: string }> {
  return sharedCampaignSlugs().map((campaign) => ({ campaign }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campaign: string }>;
}): Promise<Metadata> {
  const { campaign } = await params;
  return campaignMetadata(campaign);
}

export { default } from '../page';
