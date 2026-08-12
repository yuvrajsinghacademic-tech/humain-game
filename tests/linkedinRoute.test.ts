import { describe, expect, it } from 'vitest';
import RootPage from '@/app/page';
import LinkedInPage, { metadata } from '@/app/linkedin/page';
import { metadata as rootMetadata } from '@/app/layout';

/**
 * `/linkedin` must be the same experience as `/`, not a lookalike.
 *
 * The cheapest possible proof of that is component identity: if both routes resolve to
 * the very same function, no amount of future editing can make one drift from the other
 * without the compiler noticing. A test that compared rendered output instead would pass
 * happily on two implementations that merely agree today.
 *
 * `e2e/linkedin.spec.ts` covers the other half — that a real browser loading `/linkedin`
 * gets the boot screen, reaches the menu, and keeps the address it arrived on.
 */

describe('/linkedin', () => {
  it('is the root page component, not a copy of it', () => {
    expect(LinkedInPage).toBe(RootPage);
  });

  it('is a component rather than a redirect', () => {
    // A route that redirected would export something that throws on render, or no
    // component at all. This is an ordinary function component, which is what lets
    // analytics record `/linkedin` as the page that was actually visited.
    expect(typeof LinkedInPage).toBe('function');
  });

  it('renders the game, and nothing else', () => {
    // A single element whose type is the Game component. Asserting on the element rather
    // than on markup keeps this independent of anything Game does at runtime.
    const rendered = LinkedInPage() as { type: unknown; props: unknown };
    expect(rendered.type).toBeTypeOf('function');
    expect((rendered.type as { name?: string }).name).toBe('Game');
    expect(rendered.props).toEqual({});
  });
});

/**
 * The only intentional difference from `/`, and it is invisible to a player: two
 * addresses serving identical content should not compete for it.
 */
describe('/linkedin metadata', () => {
  it('names the homepage as canonical, absolutely', () => {
    expect(metadata.alternates?.canonical).toBe('https://www.willyoubereplaced.com/');
    // Absolute on purpose: no `metadataBase` is configured, and a relative canonical
    // without one resolves against localhost during a build.
    expect(String(metadata.alternates?.canonical)).toMatch(/^https:\/\//);
  });

  it('is noindex but still followed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('overrides the layout, which indexes everything else', () => {
    // The distinction is the point: `/` stays indexable, this route does not.
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
    expect((metadata.robots as { index?: boolean }).index).toBe(false);
  });

  it('changes nothing else about the page', () => {
    // No title, description or icon override — those still come from the layout, so the
    // tab and the share preview are identical to the homepage's.
    expect(Object.keys(metadata).sort()).toEqual(['alternates', 'robots']);
  });
});
