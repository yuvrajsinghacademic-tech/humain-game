/**
 * The handful of facts about the site itself that more than one module needs.
 *
 * Deliberately small, deliberately literal, and deliberately not derived from the
 * request: canonical URLs, the sitemap and the legal pages all have to agree on one
 * address, and a value read from a header would disagree the moment the site is
 * reached through a preview domain.
 *
 * Nothing here is a secret. Nothing here is invented either — where a fact about the
 * operator genuinely is not configured (a contact address, an advertising publisher
 * id), this module reports its absence rather than filling it in.
 */

/** The one canonical origin. No trailing slash. */
export const SITE_URL = 'https://www.willyoubereplaced.com';

export const SITE_NAME = 'hum(ai)n';

export const SITE_TAGLINE = 'will you be replaced?';

export const SITE_DESCRIPTION =
  'An AI named Darry is learning how to predict you. Psychological horror, fifteen rounds, one verdict.';

/**
 * The date the legal documents were last revised.
 *
 * A constant rather than a build timestamp: "last updated" on a privacy policy is a
 * claim about when the text changed, not about when the site was last deployed, and
 * a build clock would silently restate it on every unrelated deploy.
 */
export const LEGAL_LAST_UPDATED = 'August 15, 2026';
/** The same date, machine-readable, for `<time>` and the sitemap. */
export const LEGAL_LAST_UPDATED_ISO = '2026-08-15';

/** Absolute URL for a path. Accepts `/about` or `about`. */
export function absoluteUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${suffix === '/' ? '/' : suffix}`;
}

/**
 * A published contact address, or null.
 *
 * Read from the environment rather than written into the source, because the correct
 * value is a decision about who is publicly answerable for this site and that is not
 * something a build can invent. The legal pages render an honest sentence when it is
 * absent instead of a plausible-looking placeholder that would be a lie.
 *
 * `NEXT_PUBLIC_` because the pages that show it are static and server-rendered at
 * build time; it is an address meant to be read by visitors, not a credential.
 */
export function contactEmail(): string | null {
  const configured = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return configured && configured.includes('@') ? configured : null;
}
