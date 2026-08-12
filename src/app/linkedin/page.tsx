/**
 * `/linkedin` — the same game, at an address worth counting.
 *
 * A re-export rather than a second page, and deliberately not a redirect.
 *
 * Not a redirect because a redirect is the one thing that would defeat the purpose:
 * Vercel Web Analytics records the page that was actually rendered, so sending the
 * visitor to `/` on arrival would file every LinkedIn click under `/` and leave nothing
 * to measure. Nothing is rewritten, so the address stays `/linkedin` for the session.
 *
 * A re-export rather than a copy because "the same experience" should be true by
 * construction instead of by inspection. Both routes resolve to the identical component
 * reference, so this route cannot drift from `/` — if the root page ever gains a
 * wrapper, a provider or a suspense boundary, this inherits it in the same commit.
 * `tests/linkedinRoute.test.ts` asserts that identity.
 *
 * Title, description and icon still come from the root layout, unchanged. The two fields
 * set below are the only difference from `/`, and neither is visible to a player: they
 * exist because two addresses serving identical content is duplicate content, and a
 * campaign URL should not compete with the homepage for it.
 *
 *  - **canonical** names `/` as the real address, so ranking signals earned here
 *    consolidate there. Absolute rather than relative because no `metadataBase` is
 *    configured, and a relative canonical without one is ambiguous.
 *  - **robots** is `index: false, follow: true` — keep this URL out of the index, but
 *    still crawl onward through its links. It overrides the layout's `index: true` for
 *    this route only.
 *
 * There is no tracking here beyond the URL itself — no cookie, no identifier, no second
 * analytics provider, no environment variable.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.willyoubereplaced.com/' },
  robots: { index: false, follow: true },
};

export { default } from '../page';
