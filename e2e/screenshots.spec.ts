import { test } from '@playwright/test';
import { SEED, answerAllQuestions, enterFromBoot, playRound } from './helpers';

/**
 * Screenshot capture for visual inspection.
 *
 * Not an assertion suite — it exists so the art direction can be looked at across
 * every screen. Skipped unless `CAPTURE=true`, so it never slows a normal run.
 */

const CAPTURE = process.env.CAPTURE === 'true';
const DIR = process.env.CAPTURE_DIR ?? 'screenshots';

test.describe('visual capture', () => {
  test.skip(!CAPTURE, 'set CAPTURE=true to capture screenshots');

  test('captures every screen', async ({ page }, testInfo) => {
    const prefix = testInfo.project.name;
    /*
     * `animations: 'disabled'` finishes and freezes CSS animations before the
     * capture. Without it every screen is caught mid `fade-in`, which reads as a
     * washed-out design rather than the settled one.
     */
    const shot = async (name: string) => {
      await page.screenshot({ path: `${DIR}/${prefix}-${name}.png`, animations: 'disabled' });
    };

    // 1. Boot, then the menu
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('boot-bar').waitFor();
    await shot('00-boot');
    await enterFromBoot(page);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot('01-menu');

    // 2. Consent panel, reached from PLAY NOW
    await page.getByTestId('play-now').click();
    await page.getByTestId('consent').waitFor();
    await shot('02-consent');

    // 3. Begin-assessment choice
    await page.getByTestId('consent-accept').click();
    await page.getByTestId('begin-assessment').waitFor();
    await shot('03-choice');

    // 4. A normal question
    await page.getByTestId('begin-assessment').click();
    await page.getByTestId('question-option-0').waitFor();
    await shot('04-question');

    // 5. A Darry interjection. The first falls after the fourth answer, so answer
    //    four and catch the overlay while it is up.
    await answerAllQuestions(page, 3);
    const counter = page.getByTestId('question-counter');
    const before = await counter.innerText();
    await page.getByTestId('question-option-0').click();
    try {
      await page.getByTestId('interjection').waitFor({ timeout: 4000 });
      await shot('05-interjection');
    } catch {
      // The schedule is behaviour-driven; if none fired here, keep going.
    }
    await counter.waitFor();
    if ((await counter.innerText()) === before) {
      await page.waitForFunction(
        (text) =>
          document.querySelector('[data-testid="question-counter"]')?.textContent?.trim() !== text,
        before,
        { timeout: 20000 },
      );
    }

    // 6. Post-assessment transition
    await answerAllQuestions(page, 20);
    await page.getByTestId('darry-ready').waitFor({ timeout: 40000 });
    await shot('06-transition');

    // 7. Darry picking, machines disabled
    await page.getByTestId('play-the-game').click();
    await page.getByTestId('darry-status').waitFor();
    await shot('07-darry-picking');

    // 8. Darry finished, machines enabled
    await page
      .getByTestId('darry-status')
      .filter({ hasText: 'Darry has picked his answer.' })
      .waitFor({ timeout: 30000 });
    await shot('08-darry-picked');

    // 9. Minimal round result
    await playRound(page, 'A');
    await shot('09-round-result');

    // Play out the rest.
    for (let round = 2; round <= 15; round += 1) {
      await page.getByTestId('next-round').click();
      await playRound(page, round % 3 === 0 ? 'B' : 'A');
    }

    // 10. Loading results
    await page.getByTestId('next-round').click();
    await page.getByTestId('loading-results').waitFor({ timeout: 20000 });
    await shot('10-loading');

    // 11. "Unfortunately."
    await page.getByTestId('unfortunately').waitFor({ timeout: 45000 });
    await shot('11-unfortunately');

    // 12. "You will be replaced."
    await page.getByTestId('verdict-line').waitFor({ timeout: 15000 });
    await shot('12-verdict');

    // 13. Final percentages
    await page.getByTestId('final-numbers').waitFor({ timeout: 15000 });
    await shot('13-final-numbers');
  });
});
