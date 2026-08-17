/**
 * `/ads.txt`
 *
 * The file that tells advertising buyers which accounts are authorised to sell this
 * site's inventory. Google reads it; a wrong or missing entry is a common reason
 * AdSense revenue silently does not arrive.
 *
 * It is generated from the configured publisher id rather than committed as a static
 * file, for one reason: **there is no publisher id yet, and inventing one would be
 * worse than having no file.** A plausible-looking `pub-…` number either belongs to
 * nobody, in which case the record is noise, or belongs to somebody else, in which
 * case this site is publicly authorising a stranger to sell its inventory.
 *
 * So with nothing configured this route returns 404 — the honest answer, and the same
 * answer the site gave before it existed. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` to the
 * real value from the AdSense account and the correct record appears here
 * automatically, with no second value to keep in step.
 *
 * The certification authority id in the record (`f08c47fec0942fa0`) is Google's own
 * published constant, identical for every AdSense publisher. It is not a secret and
 * it is not guessed.
 */

import { adsTxtBody } from '@/lib/ads/config';

export const dynamic = 'force-static';

export function GET(): Response {
  const body = adsTxtBody();

  if (!body) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Buyers re-read this occasionally; an hour is plenty and keeps a correction fast.
      'cache-control': 'public, max-age=3600',
    },
  });
}
