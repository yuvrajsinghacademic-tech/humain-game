/**
 * AdSense site-ownership verification.
 *
 * Google verifies that whoever asks to monetise a domain actually controls it, and the
 * check it runs is to fetch the homepage and look for one meta tag naming the account.
 * That tag is the entire contents of this file. It is rendered through the App Router
 * metadata system in `src/app/layout.tsx` — never as a hand-written tag, and never as a
 * script.
 *
 * **This is not an ad-serving credential, and it does not switch advertising on.**
 * Everything that could actually request an ad — the `adsbygoogle` library, the
 * `AdSlot` component, the Content-Security-Policy allowances, `/ads.txt` — is gated on
 * `NEXT_PUBLIC_ADSENSE_CLIENT_ID` in `./config.ts`, which is still unset. Verification
 * necessarily comes first: the account cannot serve anything until the domain is
 * verified, so the two have to be separable, and separating them is what keeps this
 * change from being an advertising launch.
 *
 * **Why this id is written down when `./config.ts` refuses to write one down.** The
 * `no fabricated credentials` guard in `tests/ads.test.tsx` forbids a `ca-pub-` literal
 * in the five files that configure ad serving, and it should keep doing so — its point
 * is that nothing plausible-but-invented can ship, because a wrong publisher id either
 * is noise or hands a stranger the right to sell this site's inventory. That reasoning
 * does not reach this value. It is not invented: it is the real account id, supplied by
 * the account holder, and it is public by construction — it has to be readable in the
 * homepage source for verification to work at all. Committing it is also what makes the
 * tag survive a deploy, since an unset environment variable would render nothing and
 * silently fail the verification it exists to pass.
 */

/**
 * The AdSense account claiming ownership of this domain.
 *
 * Shape-checked by `tests/adsenseVerification.test.ts` rather than trusted, so a
 * mistyped or truncated paste fails a test instead of quietly failing Google's fetch.
 */
export const ADSENSE_VERIFICATION_ID = 'ca-pub-5771510660460861';

/** The meta tag name Google looks for. Fixed by Google, not by us. */
export const ADSENSE_VERIFICATION_META_NAME = 'google-adsense-account';
