/**
 * `/ads.txt`
 *
 * The file that tells advertising buyers which accounts are authorised to sell this
 * site's inventory. Google reads it; a wrong or missing entry is a common reason
 * AdSense revenue silently does not arrive.
 *
 * It is generated from the verified AdSense account rather than committed as a static
 * file, so there is no second copy of the publisher id to keep in step. For as long as
 * no account existed this route returned 404, because a plausible-looking `pub-…`
 * number either belongs to nobody, in which case the record is noise, or belongs to
 * somebody else, in which case this site is publicly authorising a stranger to sell its
 * inventory. The account is now verified, so the honest answer is the real record.
 *
 * **Publishing this does not start advertising.** The record says which account is
 * *authorised* to sell this inventory, which is true from verification onwards and is
 * what Google's site review reads. Whether anything is actually served is a separate
 * switch — `NEXT_PUBLIC_ADSENSE_CLIENT_ID` plus a slot id — and it is still off. No
 * script is loaded and no ad unit exists.
 *
 * The certification authority id in the record (`f08c47fec0942fa0`) is Google's own
 * published constant, identical for every AdSense publisher. It is not a secret and
 * it is not guessed.
 */

import { adsTxtBody } from '@/lib/ads/config';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(adsTxtBody(), {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Buyers re-read this occasionally; an hour is plenty and keeps a correction fast.
      'cache-control': 'public, max-age=3600',
    },
  });
}
