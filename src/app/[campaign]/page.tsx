/**
 * Every campaign address, served by one route.
 *
 * Campaign links are physical and social entry points into the experience, so they
 * continue to launch the game directly even though `/` is now a publisher-content
 * landing page. The route re-exports `/play` rather than copying the game component,
 * which keeps every campaign on the exact same implementation.
 *
 * `dynamicParams = false` means only registered campaign slugs exist. The URL is kept
 * in place for Vercel path analytics, while metadata keeps each campaign out of search
 * and consolidates indexing signals on the public homepage.
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

export { default } from '../play/page';
