import { expect, test } from '@playwright/test';
import {
  SEED,
  enterFromBoot,
  acceptConsent,
  startGame,
  answerAllQuestions,
  expectNoHorizontalOverflow,
  playRound,
} from './helpers';

/**
 * Layout and input on a phone, and the keyboard-only path.
 *
 * The thing that must never happen is horizontal overflow — this is a piece of
 * restrained monospace typography and a body that scrolls sideways ruins it.
 */

test.describe('phone viewport', () => {
  test('opening, consent, questions and booth all fit', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);

    await expect(page.getByTestId('boot-bar')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'boot');

    await expect(page.getByTestId('enter')).toBeVisible({ timeout: 15_000 });
    expect((await page.getByTestId('enter').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId('enter').click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    await expectNoHorizontalOverflow(page, 'menu');
    expect((await page.getByTestId('play-now').boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.getByTestId('play-now').click();
    await expect(page.getByTestId('consent')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'consent');
    // The panel must not be wider than the screen.
    const panel = await page.getByTestId('consent').boundingBox();
    expect(panel!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByTestId('consent-accept').click();
    await expectNoHorizontalOverflow(page, 'choice');

    await page.getByTestId('begin-assessment').click();
    await expect(page.getByTestId('question-option-0')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'question');
    expect((await page.getByTestId('question-option-0').boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );

    await answerAllQuestions(page);
    await expect(page.getByTestId('play-the-game')).toBeVisible({ timeout: 40_000 });
    await expectNoHorizontalOverflow(page, 'results transition');

    await page.getByTestId('play-the-game').click();
    await expect(page.getByTestId('darry-status')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'booth');

    const machine = page.getByTestId('machine-A');
    expect((await machine.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await playRound(page, 'A');
    await expectNoHorizontalOverflow(page, 'round result');
  });

  test('the skip path and ending fit the viewport', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    await expect(page.getByTestId('darry-status')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'skip booth');

    for (let round = 1; round <= 15; round += 1) {
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
      await page.getByTestId('next-round').click();
    }

    await expect(page.getByTestId('final-numbers')).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalOverflow(page, 'ending');
    // The verdict is the largest type in the game; it must still fit.
    const verdict = await page.getByTestId('verdict-line').boundingBox();
    expect(verdict!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

/**
 * The Phase 2 surfaces on a phone.
 *
 * This is where most of the traffic will arrive: somebody scans a code on a wall and
 * lands on a handset. So the campaign addresses, the documents and the post-game area
 * are held to the same rule as the game itself — nothing scrolls sideways, and
 * anything meant to be tapped can be.
 */
test.describe('phone viewport — the site around the game', () => {
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

  test('every document fits, reads, and can be tapped', async ({ page }) => {
    for (const path of EDITORIAL_PATHS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, path);

      // Legal copy that needs pinching to read is not published copy. Measured on the
      // body region specifically — the file line and the lede are paragraphs too, at
      // deliberately different sizes.
      const bodySize = await page.evaluate(() => {
        const paragraph = document.querySelector('[data-testid="editorial-body"] p');
        return paragraph ? parseFloat(getComputedStyle(paragraph).fontSize) : 0;
      });
      expect(bodySize, `${path} body copy must be legible`).toBeGreaterThanOrEqual(14);

      // Footer links are the smallest thing on the page and still have to be tappable.
      const link = await page.getByTestId('site-footer').locator('a').first().boundingBox();
      expect(link!.height, `${path} footer link target`).toBeGreaterThanOrEqual(24);

      // Scrolled to the bottom, the page still must not have grown sideways.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expectNoHorizontalOverflow(page, `${path} (scrolled)`);
    }
  });

  test('the menu’s site links are reachable without crowding the options', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await enterFromBoot(page);
    await expectNoHorizontalOverflow(page, 'menu with site links');

    const privacy = page.getByTestId('menu-site-privacy');
    await expect(privacy).toBeVisible();
    const target = (await privacy.boundingBox())!;
    expect(target.height, 'a real tap target').toBeGreaterThanOrEqual(24);

    // Clear of the last option, so a thumb reaching for SETTINGS cannot hit it.
    const settings = (await page.getByTestId('menu-settings').boundingBox())!;
    expect(target.y).toBeGreaterThan(settings.y + settings.height);
  });

  test('a campaign route is the same game at phone width', async ({ page }) => {
    await page.goto(`/sunset-b?seed=${SEED}`);
    expect(new URL(page.url()).pathname).toBe('/sunset-b');
    await enterFromBoot(page);
    await expectNoHorizontalOverflow(page, 'campaign menu');
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
  });

  test('the share controls fit under the verdict', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    for (let round = 1; round <= 15; round += 1) {
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
      await page.getByTestId('next-round').click();
    }

    await expect(page.getByTestId('final-numbers')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('aftermath')).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page, 'ending share area');

    const copy = (await page.getByTestId('share-copy').boundingBox())!;
    expect(copy.height, 'the share control is a real target').toBeGreaterThanOrEqual(44);
    expect(copy.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    const again = (await page.getByTestId('play-again').boundingBox())!;
    expect(again.height).toBeGreaterThanOrEqual(44);
    // The verdict is above the whole thing, and still on the page.
    const verdict = (await page.getByTestId('verdict-line').boundingBox())!;
    expect(verdict.y).toBeLessThan(copy.y);

    /*
     * The ad clearance, at phone height, where it matters most: a thumb travelling to
     * PLAY AGAIN must not be able to overshoot onto a click-through. Read from the
     * layout system rather than from an ad element, since no ad is configured.
     */
    const clearance = await page
      .getByTestId('aftermath')
      .evaluate((node) => getComputedStyle(node).getPropertyValue('--postgame-ad-clearance').trim());
    expect(clearance, 'the clearance must resolve to pixels').toMatch(/^[\d.]+px$/);
    expect(parseFloat(clearance), 'ad clearance at phone height').toBeGreaterThanOrEqual(180);
  });
});

test.describe('keyboard only', () => {
  test('boot, menu, warning and a question are all operable without a pointer', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);

    // ENTER takes focus itself once the bar completes, so it is pressable at once.
    await expect(page.getByTestId('enter')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('enter')).toBeFocused();
    await page.keyboard.press('Enter');

    // Then PLAY NOW opens the warning, from the keyboard.
    await page.getByTestId('play-now').focus();
    await expect(page.locator(':focus')).toHaveText(/PLAY NOW/);
    await page.keyboard.press('Enter');

    /*
     * The dialog takes focus and traps it. There are three stops, not two: the warning
     * text lives in its own scrolling region, and that region is focusable so a
     * keyboard user can actually scroll it.
     */
    await expect(page.getByTestId('consent-accept')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('consent-back')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('consent-reading')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('consent-accept')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('consent')).toHaveCount(0);
    // Focus is restored to the button that opened it.
    await expect(page.getByTestId('play-now')).toBeVisible();

    // Back in, and on into a question.
    await page.getByTestId('play-now').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('consent-accept')).toBeFocused();
    await page.keyboard.press('Enter');

    await page.getByTestId('begin-assessment').focus();
    await page.keyboard.press('Enter');

    const counter = page.getByTestId('question-counter');
    const before = await counter.innerText();
    await page.getByTestId('question-option-0').focus();
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', 'question-option-0');

    // The focus ring has to actually be drawn.
    const outline = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return element ? window.getComputedStyle(element).outlineWidth : '0px';
    });
    expect(parseFloat(outline)).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(counter).not.toHaveText(before, { timeout: 20_000 });
  });

  test('a machine cannot be reached by keyboard while Darry is deciding', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('skip-assessment').click();

    // While picking, the machines are out of the tab order entirely.
    await expect(page.getByTestId('darry-status')).toHaveText('Darry is picking his answer...');
    await expect(page.getByTestId('machine-A')).toHaveAttribute('tabindex', '-1');
    await expect(page.getByTestId('machine-B')).toHaveAttribute('tabindex', '-1');

    // Once Darry has decided they become reachable and operable.
    await expect(page.getByTestId('darry-status')).toHaveText('Darry has picked his answer.', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('machine-A')).toHaveAttribute('tabindex', '0');
    await page.getByTestId('machine-A').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('round-result')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('reduced motion', () => {
  test('plays through safely with no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?seed=${SEED}`);

    await enterFromBoot(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    // The menu static is present but frozen.
    await expect(page.getByTestId('tv-static')).toHaveAttribute('data-frozen', 'true');
    await acceptConsent(page);
    await page.getByTestId('skip-assessment').click();

    // The atmosphere layers are still present…
    await expect(page.locator('.crt-lines')).toHaveCount(1);
    await expect(page.locator('.crt-noise')).toHaveCount(1);
    // …but nothing on them is animating.
    const noiseAnimation = await page.evaluate(() => {
      const node = document.querySelector('.crt-noise');
      return node ? window.getComputedStyle(node).animationName : 'none';
    });
    expect(noiseAnimation).toBe('none');

    await playRound(page, 'A');
    await expect(page.getByTestId('verdict')).toBeVisible();
  });
});
