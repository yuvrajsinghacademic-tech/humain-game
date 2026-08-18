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
 * **Why this still has its own file.** Every other campaign address is served by the
 * shared `src/app/[campaign]/page.tsx` route, which does exactly what this file does.
 * This one predates it and is already in circulation, and a literal segment is matched
 * before a dynamic one — so keeping the file is the cheapest possible guarantee that
 * an address people have already clicked cannot change behaviour. It is registered in
 * `CAMPAIGNS` like every other campaign, marked `ownRoute`, which is what keeps the
 * shared route from also claiming this path.
 *
 * The metadata below is now produced by the shared campaign helper, so this route and
 * the ten others cannot disagree about canonicalisation. It is still exactly two
 * fields, and neither is visible to a player: two addresses serving identical content
 * is duplicate content, and a campaign URL should not compete with the homepage for it.
 *
 *  - **canonical** names `/` as the real address, so ranking signals earned here
 *    consolidate there. Absolute rather than relative because the value must be
 *    unambiguous whatever `metadataBase` is set to.
 *  - **robots** is `index: false, follow: true` — keep this URL out of the index, but
 *    still crawl onward through its links. It overrides the layout's `index: true` for
 *    this route only.
 *
 * There is no tracking here beyond the URL itself — no cookie, no identifier, no second
 * analytics provider, no environment variable.
 */

import { campaignMetadata } from '@/lib/campaigns';

export const metadata = campaignMetadata('linkedin');

export { default } from '../page';
