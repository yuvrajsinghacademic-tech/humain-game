import { expect, test, type Page } from '@playwright/test';
import { SEED, enterFromBoot, expectNoHorizontalOverflow, playRound, startGame } from './helpers';

/**
 * The layer built around the game: campaign addresses, the editorial site, the share
 * loop, and the advertising architecture.
 *
 * The through-line of every assertion here is that none of it may reach the game. A
 * campaign URL must be the game and nothing more; an editorial page must be reachable
 * without ever appearing over the booth; and an advertisement must not exist anywhere
 * a player is playing.
 */

/** Every route a QR code may point at. Mirrors `CAMPAIGNS`. */
const CAMPAIGN_SLUGS = [
  'linkedin',
  'sunset-a',
  'sunset-b',
  'melrose',
  'dtla',
  'venice',
  'silverlake',
  'usc',
  'unlv',
  'handshake-resume',
  'handshake-ai',
];

const EDITORIAL_PATHS = [
  '/about',
  '/how-it-works',
  '/darry',
  '/behind-the-game',
  '/faq',
  '/privacy',
  '/privacy-choices',
  '/terms',
];

/** Nothing that renders an advertisement may exist on the page. */
async function expectNoAdvertising(page: Page, where: string): Promise<void> {
  expect(await page.locator('[data-testid^="ad-"]').count(), `${where}: no ad surface`).toBe(0);
  expect(await page.locator('ins.adsbygoogle').count(), `${where}: no ad unit`).toBe(0);
  expect(
    await page.locator('script[src*="googlesyndication"]').count(),
    `${where}: no ad script`,
  ).toBe(0);
  expect(
    await page.getByText('ADVERTISEMENT', { exact: false }).count(),
    `${where}: no ad label`,
  ).toBe(0);
}

test.describe('campaign routes', () => {
  test('every address serves the game, keeps its own URL and is 200', async ({ request }) => {
    for (const slug of CAMPAIGN_SLUGS) {
      const response = await request.get(`/${slug}`, { maxRedirects: 0 });
      expect(response.status(), `/${slug} must not redirect`).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');

      const html = await response.text();
      expect(html, `/${slug} must serve the game`).toContain('hum(ai)n');
      /*
       * Canonicalised to the homepage, kept out of the index, still crawled onward.
       *
       * The trailing slash is optional: with `metadataBase` configured, Next
       * normalises an absolute canonical pointing at the site root to the bare
       * origin. Both spellings are the same URL; what matters is that it is the
       * homepage rather than this address.
       */
      expect(html, `/${slug} canonical`).toMatch(
        /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.willyoubereplaced\.com\/?"/,
      );
      expect(html, `/${slug} robots`).toMatch(
        /<meta[^>]+name="robots"[^>]+content="noindex, follow"/,
      );
    }
  });

  test('an unregistered slug is a 404, not a silent copy of the game', async ({ request }) => {
    // The shared route is not a catch-all: a typo on a sticker must fail visibly
    // rather than quietly serving the game at an address nobody is counting.
    for (const slug of ['fairfax-a', 'sunset-c', 'sunset_a']) {
      expect((await request.get(`/${slug}`, { maxRedirects: 0 })).status(), slug).toBe(404);
    }
  });

  test('a campaign route plays exactly like the homepage', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/sunset-a?seed=${SEED}`);
    expect(new URL(page.url()).pathname, 'no redirect on arrival').toBe('/sunset-a');

    await enterFromBoot(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    expect(new URL(page.url()).pathname).toBe('/sunset-a');

    // Into the warning, into the game — the two transitions most likely to navigate.
    await page.getByTestId('play-now').click();
    await expect(page.getByTestId('consent')).toBeVisible();
    await page.getByTestId('consent-accept').click();
    await expect(page.getByTestId('begin-assessment')).toBeVisible();

    expect(new URL(page.url()).pathname, 'the game runs on the campaign address').toBe('/sunset-a');
    await expectNoAdvertising(page, 'campaign route gameplay');
  });

  test('says nothing to the player about where they came from', async ({ page }) => {
    /*
     * One printed address and one online one. The slug does appear in the router
     * payload, exactly as it does on every campaign route — what must never happen is
     * it reaching the screen, so this reads visible text rather than the HTML.
     */
    for (const [path, ownWord] of [
      ['/melrose', 'melrose'],
      ['/handshake-resume', 'handshake'],
    ] as const) {
      await page.goto(`${path}?seed=${SEED}`);
      await enterFromBoot(page);
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const word of [ownWord, 'campaign', 'sunset', 'referral', 'you came from', 'resume']) {
        expect(text, `${path}: the menu must not mention ${word}`).not.toContain(word);
      }
    }
  });
});

test.describe('the editorial site', () => {
  for (const path of EDITORIAL_PATHS) {
    test(`${path} renders, is indexable and links onward`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // Exactly one h1, and real writing under it.
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const text = await page.locator('main, article').first().innerText();
      expect(text.length, `${path} must carry substantive content`).toBeGreaterThan(1200);

      // Metadata a crawler and a share preview actually read.
      const html = await page.content();
      expect(html, `${path} canonical`).toContain(
        `<link rel="canonical" href="https://www.willyoubereplaced.com${path}"`,
      );
      expect(html, `${path} must not be noindex`).not.toMatch(/content="noindex/);
      await expect(page).toHaveTitle(/hum\(ai\)n/);

      // The whole site is reachable from the footer.
      const footer = page.getByTestId('site-footer');
      await expect(footer).toBeVisible();
      for (const other of EDITORIAL_PATHS) {
        await expect(footer.locator(`a[href="${other}"]`)).toHaveCount(1);
      }

      await expectNoHorizontalOverflow(page, path);
      await expectNoAdvertising(page, path);
    });
  }

  test('navigation between documents works, and leads back into the game', async ({ page }) => {
    await page.goto('/about');
    await page.getByTestId('site-footer').locator('a[href="/how-it-works"]').click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Six stages');

    await page.getByTestId('site-footer').locator('a[href="/privacy"]').click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.getByTestId('masthead-play').click();
    await expect(page.getByTestId('boot-bar')).toBeVisible();
  });

  test('the legal documents say what the implementation does', async ({ page }) => {
    await page.goto('/privacy');
    const privacy = await page.locator('body').innerText();
    expect(privacy).toContain('hg_sid');
    expect(privacy).toMatch(/No advertising is running on this site at present/i);
    // The four claims the code would contradict.
    for (const lie of ['we collect no data', 'we use no cookies', 'we store absolutely nothing']) {
      expect(privacy.toLowerCase()).not.toContain(lie);
    }

    await page.goto('/terms');
    const terms = await page.locator('body').innerText();
    expect(terms).toMatch(/psychological horror/i);
    expect(terms).not.toMatch(/\bLLC\b|\bInc\.|governed by the laws of/);

    await page.goto('/privacy-choices');
    // No manager is running, and the page says exactly that rather than drawing a
    // control that would do nothing.
    await expect(page.getByTestId('consent-control-absent')).toBeVisible();
    await expect(page.getByTestId('consent-control')).toHaveCount(0);
  });
});

test.describe('the main menu', () => {
  test('offers the site without competing with the game', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await enterFromBoot(page);

    const project = page.getByTestId('menu-site-about');
    await expect(project).toBeVisible();
    await expect(page.getByTestId('menu-site-privacy')).toHaveAttribute('href', '/privacy');
    await expect(page.getByTestId('menu-site-terms')).toHaveAttribute('href', '/terms');

    // Beneath the options, and much smaller than them.
    const play = (await page.getByTestId('play-now').boundingBox())!;
    const link = (await project.boundingBox())!;
    expect(link.y, 'the site links sit below PLAY NOW').toBeGreaterThan(play.y);
    const sizes = await page.evaluate(() => ({
      play: parseFloat(
        getComputedStyle(document.querySelector('[data-testid="play-now"]')!).fontSize,
      ),
      link: parseFloat(
        getComputedStyle(document.querySelector('[data-testid="menu-site-about"]')!).fontSize,
      ),
    }));
    expect(sizes.link).toBeLessThan(sizes.play);

    await project.click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('advertising', () => {
  test('never appears anywhere in the game', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/?seed=${SEED}`);
    await expectNoAdvertising(page, 'boot');

    await enterFromBoot(page);
    await expectNoAdvertising(page, 'menu');

    await page.getByTestId('play-now').click();
    await expect(page.getByTestId('consent')).toBeVisible();
    await expectNoAdvertising(page, 'consent');

    await page.getByTestId('consent-accept').click();
    await expectNoAdvertising(page, 'choice');

    await page.getByTestId('skip-assessment').click();
    await expect(page.getByTestId('darry-status')).toBeVisible();
    await expectNoAdvertising(page, 'booth');

    await playRound(page, 'A');
    await expectNoAdvertising(page, 'round result');

    await page.getByTestId('next-round').click();
    await expectNoAdvertising(page, 'round transition');
  });

  /**
   * The distance between PLAY AGAIN and any advertisement below it.
   *
   * Measured in a real browser rather than asserted from the stylesheet, because the
   * value is responsive and the thing worth knowing is what it resolves to at an
   * actual viewport. `--postgame-ad-clearance` is registered with `@property` as a
   * `<length>`, so the browser computes `max(180px, 24vh)` and reports pixels.
   *
   * No ad is configured, so there is no ad element to measure against — which is the
   * point of taking the figure from the layout system instead: the guarantee holds
   * whether or not an ad happens to be rendering at the time.
   */
  test('keeps any post-game ad at least 180px from PLAY AGAIN', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    for (let round = 1; round <= 15; round += 1) {
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
      await page.getByTestId('next-round').click();
    }

    const aftermath = page.getByTestId('aftermath');
    await expect(aftermath).toBeVisible({ timeout: 60_000 });

    const measured = await aftermath.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        clearance: styles.getPropertyValue('--postgame-ad-clearance').trim(),
        gap: styles.rowGap,
        viewport: window.innerHeight,
      };
    });

    // A browser that had not registered the property would hand back the literal
    // expression; failing here is correct, because the guarantee would be unmeasured.
    expect(measured.clearance, 'the clearance must resolve to pixels').toMatch(/^[\d.]+px$/);

    const clearance = parseFloat(measured.clearance);
    expect(
      clearance,
      `clearance was ${clearance}px at ${measured.viewport}px tall — the floor is 180px`,
    ).toBeGreaterThanOrEqual(180);

    // And it really is the button-to-ad distance: the wrapper's own margin plus the
    // grid gap above it must add back up to the declared clearance.
    const margin = await page.evaluate((gap) => {
      const probe = document.createElement('div');
      probe.style.marginTop = `calc(var(--postgame-ad-clearance) - ${gap})`;
      document.querySelector('[data-testid="aftermath"]')!.appendChild(probe);
      const resolved = parseFloat(getComputedStyle(probe).marginTop);
      probe.remove();
      return resolved;
    }, measured.gap);

    expect(Math.round(margin + parseFloat(measured.gap))).toBe(Math.round(clearance));
  });

  test('declares site ownership to AdSense without loading anything from it', async ({
    request,
  }) => {
    /*
     * The verification tag is a claim about who owns the domain, and Google reads it by
     * fetching this page. Asserted against the served HTML rather than the metadata
     * object, because what matters is what leaves the server.
     */
    const html = await (await request.get('/')).text();
    expect(html).toMatch(
      /<meta name="google-adsense-account" content="ca-pub-5771510660460861"\s*\/?>/,
    );
    // Exactly one, and inside the head.
    const tags = html.match(/<meta name="google-adsense-account"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(html.indexOf('google-adsense-account')).toBeLessThan(html.indexOf('</head>'));
    // Naming the account must not have started serving for it.
    expect(html).not.toContain('googlesyndication');
    expect(html).not.toContain('adsbygoogle');
    expect(html).not.toContain('data-ad-client');
    expect(html).not.toMatch(/enable_page_level_ads|data-ad-frequency-hint/);
  });

  test('publishes ads.txt naming the verified account, and nothing more', async ({ request }) => {
    const response = await request.get('/ads.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    // Byte for byte, one line, trailing newline included.
    expect(await response.text()).toBe(
      'google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n',
    );
  });

  test('publishing ads.txt did not start serving anything', async ({ request }) => {
    // The record authorises an account to sell inventory; it does not create inventory.
    const html = await (await request.get('/')).text();
    expect(html).not.toContain('googlesyndication');
    expect(html).not.toContain('adsbygoogle');
    expect(html).not.toContain('data-ad-client');
    expect(html).not.toMatch(/enable_page_level_ads|data-ad-frequency-hint/);
    // And the ownership tag it derives from is still there.
    expect(html).toContain('google-adsense-account');
  });
});

test.describe('search', () => {
  test('the sitemap lists the documents and no campaign address', async ({ request }) => {
    const xml = await request.get('/sitemap.xml').then((response) => response.text());

    expect(xml).toContain('<loc>https://www.willyoubereplaced.com/</loc>');
    for (const path of EDITORIAL_PATHS) {
      expect(xml, `${path} must be listed`).toContain(
        `<loc>https://www.willyoubereplaced.com${path}</loc>`,
      );
    }
    for (const slug of CAMPAIGN_SLUGS) {
      expect(xml, `/${slug} must not be listed`).not.toContain(`/${slug}<`);
    }
  });

  test('robots.txt opens the site, closes the API, and finds the sitemap', async ({ request }) => {
    const text = await request.get('/robots.txt').then((response) => response.text());

    expect(text).toMatch(/Allow: \//);
    expect(text).toMatch(/Disallow: \/api\//);
    expect(text).toContain('Sitemap: https://www.willyoubereplaced.com/sitemap.xml');
    // Campaign paths are crawlable on purpose: a blocked page's noindex is never read.
    for (const slug of CAMPAIGN_SLUGS) {
      expect(text, `/${slug} must remain crawlable`).not.toContain(`Disallow: /${slug}`);
    }
  });

  test('the homepage carries a social preview image', async ({ request }) => {
    const html = await request.get('/').then((response) => response.text());
    expect(html).toMatch(/property="og:image"/);

    const image = await request.get('/opengraph-image');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
  });
});

test.describe('the share loop', () => {
  test('appears only after the reveal, and copies a result carrying nothing private', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    for (let round = 1; round <= 15; round += 1) {
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
      await page.getByTestId('next-round').click();
    }

    // The reveal lands first, with nothing else on the screen.
    await expect(page.getByTestId('verdict-line')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('aftermath')).toHaveCount(0);

    await expect(page.getByTestId('final-numbers')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('aftermath')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('share-result')).toBeVisible();
    await expect(page.getByTestId('play-again')).toBeVisible();

    // And the verdict is still there — the aftermath was added below it.
    await expect(page.getByTestId('verdict-line')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'ending with share controls');
    await expectNoAdvertising(page, 'ending');

    const darry = await page.getByTestId('score-darry').innerText();

    await page.getByTestId('share-copy').click();
    await expect(page.getByTestId('share-status')).toHaveText('Copied.');

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('choices in hum(ai)n');
    expect(copied).toContain(darry.replace('%', ''));
    expect(copied).toContain('willyoubereplaced.com');
    // The share sends a friend to the homepage, never to a campaign address.
    expect(copied).toContain('https://www.willyoubereplaced.com/');
    expect(copied).not.toMatch(
      /\/(sunset|melrose|dtla|venice|silverlake|usc|unlv|linkedin|handshake)/,
    );
    // Nothing about how they played.
    expect(copied).not.toMatch(/winStay|leftBias|profile|reasoning|session|round \d/i);
  });

  test('PLAY AGAIN still works, and is nowhere near an ad surface', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    for (let round = 1; round <= 15; round += 1) {
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
      await page.getByTestId('next-round').click();
    }

    await expect(page.getByTestId('play-again')).toBeVisible({ timeout: 60_000 });
    await expectNoAdvertising(page, 'post-game');

    await page.getByTestId('play-again').click();
    await expect(page.getByTestId('darry-status')).toBeVisible({ timeout: 30_000 });
    // Straight back into the booth, with no question repeated.
    await expect(page.getByTestId('question-option-0')).toHaveCount(0);
  });
});
