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
 * Metadata comes from the root layout, unchanged: same title, same description, same
 * icon. There is no tracking here beyond the URL itself — no cookie, no identifier, no
 * second analytics provider, no environment variable.
 */

export { default } from '../page';
