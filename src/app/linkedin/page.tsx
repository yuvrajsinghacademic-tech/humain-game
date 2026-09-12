/**
 * `/linkedin` — the game at a stable campaign address worth counting.
 *
 * The public homepage is now a publisher-content landing page, but campaign traffic
 * should still enter the experience directly. Re-exporting `/play` preserves component
 * identity without redirecting, so Vercel can continue to attribute this path while
 * the player gets the exact same game implementation.
 */

import { campaignMetadata } from '@/lib/campaigns';

export const metadata = campaignMetadata('linkedin');

export { default } from '../play/page';
