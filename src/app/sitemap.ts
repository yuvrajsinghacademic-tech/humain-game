/**
 * The sitemap.
 *
 * Nine URLs: the game, and the eight documents about it. Campaign addresses are
 * deliberately absent — they are `noindex` and canonicalised to `/`, so listing them
 * would be asking a crawler to index something the page then tells it not to. There
 * is nothing at a campaign address that is not at `/`.
 *
 * `lastModified` is the legal revision date rather than a build clock. A sitemap that
 * restamps every page on every deploy is telling crawlers the content changed when it
 * did not, and it makes the file non-deterministic, which is a nuisance to test.
 */

import type { MetadataRoute } from 'next';
import { EDITORIAL_LINKS } from '@/features/editorial/chrome';
import { LEGAL_LAST_UPDATED_ISO, absoluteUrl } from '@/lib/site/config';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl('/'),
      lastModified: LEGAL_LAST_UPDATED_ISO,
      changeFrequency: 'monthly',
      priority: 1,
    },
    ...EDITORIAL_LINKS.map((link) => ({
      url: absoluteUrl(link.href),
      lastModified: LEGAL_LAST_UPDATED_ISO,
      changeFrequency: 'yearly' as const,
      priority: link.href === '/about' || link.href === '/how-it-works' ? 0.8 : 0.5,
    })),
  ];
}
