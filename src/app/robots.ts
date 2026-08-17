/**
 * robots.txt
 *
 * Everything is crawlable except the API. That includes the campaign addresses, and
 * the reason is worth writing down because the instinct is to disallow them:
 *
 * A disallowed path is never fetched, so the `noindex` on a campaign page would never
 * be read — and a URL that is linked from elsewhere can still end up listed on the
 * strength of those links alone, as a bare address with no title. Letting a crawler
 * fetch the page and find `noindex` is what actually keeps it out of the index, and
 * `follow` means the links on it still consolidate onto `/`.
 *
 * `/api/` is disallowed because every route under it is a POST that returns
 * `no-store` JSON. There is nothing there to index and no reason to spend crawl
 * budget discovering that.
 */

import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
