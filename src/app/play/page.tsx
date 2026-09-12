import type { Metadata } from 'next';
import { Game } from '@/features/game/Game';
import { absoluteUrl } from '@/lib/site/config';

/**
 * The interactive experience.
 *
 * Kept out of search results on purpose: this route is a client-driven game screen,
 * not a publisher-content page. The indexable entry point is `/`, which explains the
 * project and links here. No advertising is rendered anywhere in this route.
 */
export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl('/') },
  robots: { index: false, follow: true },
};

export default function PlayPage() {
  return <Game />;
}
