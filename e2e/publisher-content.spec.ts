import { expect, test } from '@playwright/test';

/**
 * Regression coverage for the architecture AdSense reviews.
 *
 * Searchable pages are substantive publisher content. The interactive game and every
 * campaign entry are explicitly non-indexable experiences with no advertising surface.
 */
test.describe('publisher-content boundary', () => {
  test('the public homepage is substantive server-rendered content', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Can an AI predict you before you choose?',
    );

    const article = page.locator('[data-testid="editorial-article"]');
    await expect(article).toBeVisible();
    const text = await article.innerText();
    expect(text.length, 'homepage needs real publisher copy, not an app shell').toBeGreaterThan(1800);
    await expect(page.getByTestId('home-play')).toHaveAttribute('href', '/play');

    const html = await response!.text();
    expect(html).toContain('Can an AI predict you before you choose?');
    expect(html).toContain('What Darry is actually looking at');
    expect(html).not.toMatch(/content="noindex/);

    expect(await page.locator('[data-testid^="ad-"]').count()).toBe(0);
    expect(await page.locator('ins.adsbygoogle').count()).toBe(0);
  });

  test('/play is the game, noindex, canonical to the publisher homepage, and ad-free', async ({ page }) => {
    const response = await page.goto('/play');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('boot-bar')).toBeVisible();

    const html = await page.content();
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+content="noindex, follow"/);
    expect(html).toMatch(
      /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.willyoubereplaced\.com\/?"/,
    );

    expect(await page.locator('[data-testid^="ad-"]').count()).toBe(0);
    expect(await page.locator('ins.adsbygoogle').count()).toBe(0);
    expect(await page.locator('script[src*="googlesyndication"]').count()).toBe(0);
  });

  test('campaign entries still launch the same ad-free game directly', async ({ page }) => {
    const response = await page.goto('/sunset-a');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/sunset-a');
    await expect(page.getByTestId('boot-bar')).toBeVisible();

    const html = await page.content();
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+content="noindex, follow"/);
    expect(await page.locator('ins.adsbygoogle').count()).toBe(0);
  });
});
