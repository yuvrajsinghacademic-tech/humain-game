/**
 * Advertising configuration.
 *
 * The whole integration is driven by environment variables, and the default state —
 * every variable unset — is the state this repository is in. With nothing
 * configured:
 *
 *  - no advertising script is loaded,
 *  - no request is made to any Google host,
 *  - `/ads.txt` does not exist,
 *  - `AdSlot` renders nothing at all,
 *  - the Content-Security-Policy is byte-identical to the one the game shipped with.
 *
 * Nothing here fabricates a publisher id, a slot id or an `ads.txt` record. Those
 * three values come from a real AdSense account and there is no honest way to guess
 * them; a plausible-looking placeholder would either fail review or, worse, send
 * traffic to somebody else's account. See `docs/MONETIZATION.md`.
 *
 * `NEXT_PUBLIC_` on all of them is correct and not a leak: a publisher id and a slot
 * id are printed into the ad tag on every page that shows an ad. They are public by
 * construction. The repository's security invariants scan for `NEXT_PUBLIC_*` names
 * ending in KEY/SECRET/TOKEN — none of these do, deliberately.
 *
 * Every read is a direct `process.env.NEXT_PUBLIC_…` expression rather than a lookup
 * through a variable, because Next inlines these at build time by textual
 * substitution and a computed key would inline as `undefined`.
 */

import { ADSENSE_VERIFICATION_ID } from './verification';

/** The ad surfaces this site has. Adding one here is a deliberate act. */
export type AdSurface = 'editorial' | 'postgame';

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

/**
 * The AdSense publisher id — the `ca-pub-` prefix followed by sixteen digits.
 *
 * Validated in shape rather than merely presence, so a half-pasted value fails to
 * enable advertising instead of loading a broken tag on every page. No example value
 * is written out anywhere in this repository, deliberately: `tests/ads.test.tsx`
 * fails on any digit-shaped publisher id in the source, which is the cheapest way to
 * guarantee nothing plausible-but-wrong ever ships.
 */
export function adsenseClientId(): string | null {
  const configured = clean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID);
  if (!configured) return null;
  return /^ca-pub-\d{10,20}$/.test(configured) ? configured : null;
}

/** The ad unit id for a surface, or null when that unit has not been created yet. */
export function adSlotId(surface: AdSurface): string | null {
  const configured =
    surface === 'editorial'
      ? clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL)
      : clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME);
  if (!configured) return null;
  // AdSense slot ids are numeric strings.
  return /^\d{6,20}$/.test(configured) ? configured : null;
}

/** True only when a real ad could actually be requested for this surface. */
export function adsEnabled(surface: AdSurface): boolean {
  return adsenseClientId() !== null && adSlotId(surface) !== null;
}

/**
 * Whether to draw an empty, clearly-labelled outline where an ad would go.
 *
 * Off unless explicitly switched on, and never on in production. It exists so the
 * spacing around an ad surface can be judged before an AdSense account exists —
 * not so that development pretends to be monetised. It draws a box; it never loads
 * a script and never contacts Google.
 */
export function adPlaceholdersEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return clean(process.env.NEXT_PUBLIC_AD_PLACEHOLDERS) === 'true';
}

/** The library every AdSense unit is served by. Loaded lazily, only when needed. */
export const ADSENSE_SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * The `ads.txt` body.
 *
 * Derived from the **verified account** rather than from the ad-serving variables, and
 * that distinction is the whole design of this function.
 *
 * `ads.txt` answers "who is authorised to sell this site's inventory?". That is a
 * statement about who owns the domain and which account may monetise it — the same kind
 * of claim as the verification meta tag, and true from the moment the account is
 * verified. It is not a statement that ads are running. Buyers and Google's own site
 * review read this file *before* any ad is served, so gating it on the serving switch
 * would withhold the record exactly when it is needed.
 *
 * So it follows `ADSENSE_VERIFICATION_ID`, and everything that could actually request
 * an ad — `adsEnabled`, `AdSlot`, the script, the Content-Security-Policy — continues
 * to be gated on `NEXT_PUBLIC_ADSENSE_CLIENT_ID`, which is unrelated to this and still
 * unset. Publishing the record does not load anything.
 *
 * Nothing is guessed: the account id is the verified one, and `f08c47fec0942fa0` is
 * Google's own published certification authority id, identical for every AdSense
 * publisher. The publisher field is derived from the account id by dropping the `ca-`
 * prefix, so the two cannot disagree.
 */
export function adsTxtBody(): string {
  const publisher = ADSENSE_VERIFICATION_ID.replace(/^ca-/, '');
  return `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`;
}
