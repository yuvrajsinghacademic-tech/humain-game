import { expect, test, type Page } from '@playwright/test';
import { SEED, enterFromBoot } from './helpers';

/**
 * `/linkedin` is a trackable address, not a different experience.
 *
 * Two things are asserted, and they are separate claims:
 *
 *  1. **It is the same experience.** Boot, ENTER, the menu, the warning — structurally
 *     identical to `/`. Compared as structure rather than pixels on purpose: the opening
 *     is deliberately full of randomised glitch and television static, so a screenshot
 *     comparison would fail for reasons that have nothing to do with this route.
 *
 *  2. **The address survives.** No redirect, no rewrite, no `history.replaceState`. This
 *     is the whole point: Vercel Web Analytics records the page that rendered, so if
 *     anything moved the visitor to `/` on arrival there would be nothing to count.
 */

/** The structure of the opening, as a comparable fingerprint. */
async function opening(page: Page) {
  await page.getByTestId('boot-bar').waitFor();
  const bootText = (await page.locator('main').innerText()).trim();
  const bootBars = await page.getByTestId('boot-bar').count();

  await enterFromBoot(page);

  const heading = page.getByRole('heading', { level: 1 });
  await heading.waitFor();

  return {
    // The boot screen is deliberately wordless.
    bootText,
    bootBars,
    // The wordmark's accessible name lives on the `role="img"` inside the heading, so
    // that a glitched rendering never changes what a screen reader announces.
    headingName: await page.locator('h1 [role="img"]').first().getAttribute('aria-label'),
    // Every control the menu offers, in order.
    controls: await page
      .locator('[data-testid="play-now"], [data-testid="menu-about"], [data-testid="menu-settings"]')
      .evaluateAll((nodes) => nodes.map((n) => `${n.getAttribute('data-testid')}:${n.textContent?.trim()}`)),
    staticCanvases: await page.getByTestId('tv-static').count(),
  };
}

test.describe('/linkedin', () => {
  test('renders the same opening as / and keeps its own address', async ({ page }) => {
    test.setTimeout(120_000);

    const fromRoot = await page.goto(`/?seed=${SEED}`).then(() => opening(page));

    await page.goto(`/linkedin?seed=${SEED}`);
    // Before anything else: arriving here must not have bounced us somewhere else.
    expect(new URL(page.url()).pathname, 'no redirect on arrival').toBe('/linkedin');

    const fromLinkedIn = await opening(page);

    expect(fromLinkedIn).toEqual(fromRoot);
    expect(fromLinkedIn.headingName).toBe('hum(ai)n');
    expect(fromLinkedIn.bootText, 'the boot screen carries no text').toBe('');

    // Still `/linkedin` after booting and reaching the menu — nothing rewrote it.
    expect(new URL(page.url()).pathname, 'address preserved through the opening').toBe('/linkedin');
  });

  test('plays on from /linkedin without ever leaving it', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/linkedin?seed=${SEED}`);
    await enterFromBoot(page);

    // Into the warning and back out, the two transitions most likely to navigate.
    await page.getByTestId('play-now').click();
    await expect(page.getByTestId('consent')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/linkedin');

    await page.getByTestId('consent-back').click();
    await expect(page.getByTestId('play-now')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/linkedin');

    // And into the game proper.
    await page.getByTestId('play-now').click();
    await page.getByTestId('consent-accept').click();
    await expect(page.getByTestId('begin-assessment')).toBeVisible();
    expect(new URL(page.url()).pathname, 'the game runs entirely on this address').toBe('/linkedin');
  });

  test('is served as a page, not a redirect', async ({ request }) => {
    // Checked at the protocol level: a 200 with the document, no 3xx hop. A redirect
    // here would file every LinkedIn arrival under `/` in analytics.
    const response = await request.get('/linkedin', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('hum(ai)n');
  });
});
