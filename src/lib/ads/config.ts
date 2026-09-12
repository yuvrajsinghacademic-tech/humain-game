/**
 * Advertising configuration.
 *
 * Advertising is deliberately confined to substantive editorial articles. The game,
 * its ending, campaign routes, the homepage, and legal/support pages have no ad
 * surface at all.
 *
 * The integration is driven by environment variables, and the default state — every
 * serving variable unset — is ad-free. With nothing configured:
 *
 *  - no advertising script is loaded,
 *  - no request is made to any Google ad-serving host,
 *  - `AdSlot` renders nothing at all,
 *  - the Content-Security-Policy stays on its ad-free branch.
 *
 * `/ads.txt` is separate: it identifies the verified seller even before serving is
 * enabled. See `verification.ts` and `docs/MONETIZATION.md`.
 */

import { ADSENSE_VERIFICATION_ID } from './verification';

/** The only advertising surface this site permits. */
export type AdSurface = 'editorial';

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

/**
 * The public AdSense publisher id. It is part of the browser ad tag, not a secret.
 * Shape validation makes a partial paste fail closed rather than load a broken tag.
 */
export function adsenseClientId(): string | null {
  const configured = clean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID);
  if (!configured) return null;
  return /^ca-pub-\d{10,20}$/.test(configured) ? configured : null;
}

/** The one editorial ad-unit id, or null until a real unit has been created. */
export function adSlotId(_surface: AdSurface): string | null {
  const configured = clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL);
  if (!configured) return null;
  return /^\d{6,20}$/.test(configured) ? configured : null;
}

/** True only when a real editorial ad could actually be requested. */
export function adsEnabled(surface: AdSurface): boolean {
  return adsenseClientId() !== null && adSlotId(surface) !== null;
}

/**
 * Development-only empty outline for judging editorial spacing. It never loads an ad
 * library, and production ignores it even if the variable is accidentally set.
 */
export function adPlaceholdersEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return clean(process.env.NEXT_PUBLIC_AD_PLACEHOLDERS) === 'true';
}

/** The library an approved editorial AdSense unit uses, loaded lazily by AdSlot. */
export const ADSENSE_SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * The `ads.txt` body.
 *
 * This follows the verified account rather than the ad-serving switch. It says which
 * account is authorised to sell inventory on the domain; it does not say that an ad
 * is currently running. Keeping it independent lets Google verify the seller while
 * the site remains completely ad-free during review.
 */
export function adsTxtBody(): string {
  const publisher = ADSENSE_VERIFICATION_ID.replace(/^ca-/, '');
  return `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`;
}
