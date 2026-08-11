import { expect, test, type Page } from '@playwright/test';
import {
  QUESTION_COUNT,
  SEED,
  TOTAL_ROUNDS,
  acceptConsent,
  startGame,
  answerAllQuestions,
  expectNoBannedCopy,
  installOrderingProbe,
  playRound,
  playWholeGame,
  readOrderingTimeline,
} from './helpers';

/**
 * The complete assessment path, plus the guarantee the whole piece rests on.
 *
 * The commitment hash is no longer on screen, so the visible proof is the ordering:
 * the machines must never become usable except in a commit where Darry has already
 * picked. That is recorded by a MutationObserver installed before the app boots, so
 * the assertion cannot be defeated by timing.
 *
 * The cryptographic proof — that the revealed prediction is the sealed one — is
 * still enforced server-side and still covered by tests/seal.test.ts and
 * tests/api.test.ts. It is simply no longer a thing the player is shown.
 */

/**
 * The static's gain. Read straight off the element, so it holds whether or not this
 * project's Chromium permitted playback to begin — the level is set either way. Live
 * playback itself is proved in `audio-live.spec.ts`.
 */
const gain = (page: Page) => page.evaluate(() => document.querySelector('audio')?.volume ?? -1);

/** Loud at the front, markedly quieter once the warning has been accepted. */
const MENU_GAIN = 0.95;
const GAME_GAIN = 0.24;

test.describe('assessment path', () => {
  test('opening to ending, with Darry deciding before every round', async ({ page }) => {
    await installOrderingProbe(page);

    // --- Boot: black, a bar, no text, and complete silence ------------------
    await page.goto(`/?seed=${SEED}`);
    await expect(page.getByTestId('boot-bar')).toBeVisible();
    // No wordmark, no title, no percentage on this screen.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    expect((await page.locator('main').innerText()).trim()).toBe('');

    // Nothing may be playing before ENTER.
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0);

    // --- ENTER: the gesture that unlocks audio ------------------------------
    await expect(page.getByTestId('enter')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('enter').click();

    // --- Main menu ----------------------------------------------------------
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveAccessibleName('hum(ai)n');
    await expect(page.getByTestId('play-now')).toBeVisible();
    await expect(page.getByTestId('menu-about')).toBeVisible();
    await expect(page.getByTestId('menu-settings')).toBeVisible();
    await expect(page.getByTestId('tv-static')).toHaveCount(1);
    // The old opening button is gone.
    await expect(page.getByRole('button', { name: 'will you be replaced?' })).toHaveCount(0);
    await expectNoBannedCopy(page, 'menu');

    // --- Warning, reached from PLAY NOW ------------------------------------
    await page.getByTestId('play-now').click();
    const consent = page.getByTestId('consent');
    await expect(consent).toBeVisible();
    await expect(consent).toHaveAttribute('aria-modal', 'true');
    await expect(consent).toContainText('experimental AI model named Darry');
    await expect(consent).toContainText('The model was not shut down.');
    await expect(consent).toContainText('WARNING:');
    await expect(consent).toContainText('sustained psychological horror');

    // The warning is read at full volume: opening it is not the commitment.
    await expect.poll(() => gain(page)).toBeCloseTo(MENU_GAIN, 2);

    // BACK returns to the menu — never to the boot screen — and changes no level.
    await page.getByTestId('consent-back').click();
    await expect(page.getByTestId('consent')).toHaveCount(0);
    await expect(page.getByTestId('play-now')).toBeVisible();
    await expect(page.getByTestId('boot-bar')).toHaveCount(0);
    await expect(page.getByTestId('enter')).toHaveCount(0);
    expect(await gain(page)).toBeCloseTo(MENU_GAIN, 2);

    // --- Fork --------------------------------------------------------------
    await acceptConsent(page);
    await expect(page.getByTestId('begin-assessment')).toBeVisible();
    await expect(page.getByTestId('skip-assessment')).toBeVisible();

    // Accepting is what quietened it, and this is where that has landed.
    await expect.poll(() => gain(page)).toBeCloseTo(GAME_GAIN, 3);

    // --- Questions ---------------------------------------------------------
    await page.getByTestId('begin-assessment').click();
    await expect(page.getByTestId('question-counter')).toHaveText(`question 01 / ${QUESTION_COUNT}`);
    await expectNoBannedCopy(page, 'first question');
    // The assessment runs at the quiet level throughout.
    expect(await gain(page)).toBeCloseTo(GAME_GAIN, 3);

    await answerAllQuestions(page);
    expect(await gain(page), 'still quiet after the last question').toBeCloseTo(GAME_GAIN, 3);

    // --- Transition: no analytics dashboard --------------------------------
    await expect(page.getByTestId('tested-line')).toHaveText('Your results have been tested.', {
      timeout: 40_000,
    });
    await expect(page.getByTestId('darry-ready')).toHaveText('Darry is ready.');
    const transition = await page.locator('body').innerText();
    expect(transition).not.toContain('You were not being tested');
    expect(transition).not.toMatch(/\d+%/);
    await expectNoBannedCopy(page, 'results transition');

    // --- Booth: entered directly, no explanation screen --------------------
    await page.getByTestId('play-the-game').click();
    await expect(page.getByRole('heading', { name: 'prediction booth' })).toBeVisible();
    const booth = await page.locator('body').innerText();
    expect(booth).not.toContain('Enter the booth');
    expect(booth).not.toContain('playing against the model');

    // Assessment rewards are feedback, not currency: the booth opens at zero.
    await expect(page.getByTestId('coins')).toHaveText('0');

    // And the booth is on the same quiet level the assessment was.
    expect(await gain(page)).toBeCloseTo(GAME_GAIN, 3);

    // Darry is deciding, and neither machine is touchable.
    await expect(page.getByTestId('darry-status')).toHaveText('Darry is picking his answer...');
    await expect(page.getByTestId('machine-A')).toBeDisabled();
    await expect(page.getByTestId('machine-B')).toBeDisabled();

    /*
     * Booth rounds do pay, and they pay from a base of zero in ten-coin steps.
     * Checked after the first round, while the booth is still on screen — the last
     * `next round` leaves it for the ending.
     */
    const firstRound = await playRound(page, 'A');
    const coinsAfterOne = Number(await page.getByTestId('coins').innerText());
    expect([0, 10]).toContain(coinsAfterOne);
    await page.getByTestId('next-round').click();

    const rounds = [firstRound, ...(await playWholeGame(page, 2))];
    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    for (const round of rounds) expect(['A', 'B']).toContain(round.prediction);

    // --- The ordering proof, over all fifteen rounds -----------------------
    const raw = await readOrderingTimeline(page);
    expect(
      raw.some((event) => event.type === 'installed'),
      'the ordering probe was installed',
    ).toBe(true);

    const timeline = raw.filter((event) => event.type !== 'installed');
    const seals = timeline.filter((event) => event.type === 'sealed');
    const unlocks = timeline.filter((event) => event.type === 'machines-enabled');

    expect(seals.length, 'Darry decided once per round').toBe(TOTAL_ROUNDS);
    expect(unlocks.length, 'the machines opened once per round').toBe(TOTAL_ROUNDS);

    for (const [index, unlock] of unlocks.entries()) {
      expect(
        unlock.status,
        `round ${index + 1}: Darry had already picked when the machines opened`,
      ).toBe('Darry has picked his answer.');
    }

    let sealedSoFar = 0;
    let unlockedSoFar = 0;
    for (const event of timeline) {
      if (event.type === 'sealed') sealedSoFar += 1;
      else unlockedSoFar += 1;
      expect(
        unlockedSoFar,
        'the machines can never have opened more times than Darry has decided',
      ).toBeLessThanOrEqual(sealedSoFar);
    }

    // --- Ending ------------------------------------------------------------
    await expect(page.getByTestId('loading-results')).toBeVisible({ timeout: 20_000 });
    const loadingAppearedAt = Date.now();

    await expect(page.getByTestId('unfortunately')).toHaveText('Unfortunately.', { timeout: 45_000 });
    // The loading state is held for a beat, not flashed past.
    expect(Date.now() - loadingAppearedAt).toBeGreaterThanOrEqual(1900);

    await expect(page.getByTestId('verdict-line')).toHaveText('You will be replaced.', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('final-numbers')).toBeVisible({ timeout: 15_000 });

    // The two percentages must be Darry's real accuracy and exactly the remainder.
    const expectedCorrect = rounds.filter((round) => round.prediction === round.choice).length;
    const expectedDarry = Math.round((expectedCorrect / TOTAL_ROUNDS) * 100);
    await expect(page.getByTestId('score-darry')).toHaveText(`${expectedDarry}%`);
    await expect(page.getByTestId('score-you')).toHaveText(`${100 - expectedDarry}%`);

    const note = await page.getByTestId('ending-note').innerText();
    expect(note.length).toBeLessThanOrEqual(190);
    if (expectedDarry < 50) {
      // A losing Darry must not claim it already won.
      expect(note).toContain('has not finished learning');
    } else {
      expect(note).toContain(`${expectedCorrect} of your ${TOTAL_ROUNDS}`);
    }

    await expectNoBannedCopy(page, 'ending');
    await expect(page.getByTestId('play-again')).toBeVisible();

    // --- Nothing behavioural was written to the device --------------------
    const stored = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key !== 'humain.audio.muted'),
    );
    expect(stored, 'no behavioural data persisted').toEqual([]);
  });
});

test.describe('play again', () => {
  test('returns straight to the booth and keeps what Darry learned', async ({ page }) => {
    const interpretCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/interpret')) interpretCalls.push(request.url());
    });

    await page.goto(`/?seed=${SEED}`);
    await startGame(page);
    await page.getByTestId('begin-assessment').click();
    await answerAllQuestions(page);
    await expect(page.getByTestId('play-the-game')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('play-the-game').click();

    await playWholeGame(page);
    await expect(page.getByTestId('play-again')).toBeVisible({ timeout: 45_000 });

    expect(interpretCalls, 'one interpretation on the assessment path').toHaveLength(1);

    await page.getByTestId('play-again').click();

    // Straight back into the booth: not the opening, not consent, not questions.
    await expect(page.getByRole('heading', { name: 'prediction booth' })).toBeVisible();
    await expect(page.getByTestId('round-counter')).toHaveText(`round 1 / ${TOTAL_ROUNDS}`);
    await expect(page.getByTestId('coins')).toHaveText('0');
    await expect(page.getByTestId('question-counter')).toHaveCount(0);
    await expect(page.getByTestId('consent')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'will you be replaced?' })).toHaveCount(0);

    // And no second interpretation was requested.
    expect(interpretCalls, 'no interpretation on replay').toHaveLength(1);

    // The second game plays through normally, with Darry still deciding first.
    await expect(page.getByTestId('darry-status')).toHaveText('Darry has picked his answer.', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('machine-A')).toBeEnabled();
  });
});

test.describe('skip path', () => {
  test('bypasses every question and never asks for an interpretation', async ({ page }) => {
    const interpretCalls: string[] = [];
    const predictCalls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/interpret')) interpretCalls.push(url);
      if (url.includes('/api/predict')) predictCalls.push(url);
    });

    await installOrderingProbe(page);
    await page.goto(`/?seed=${SEED}`);
    await startGame(page);

    await page.getByTestId('skip-assessment').click();

    // Straight into the booth, with no question ever shown.
    await expect(page.getByRole('heading', { name: 'prediction booth' })).toBeVisible();
    await expect(page.getByTestId('question-counter')).toHaveCount(0);
    await expect(page.getByTestId('tested-line')).toHaveCount(0);
    await expect(page.getByTestId('darry-ready')).toHaveCount(0);

    await expect(page.getByTestId('coins')).toHaveText('0');

    // Darry still decides before the machines open, on a neutral profile.
    await expect(page.getByTestId('darry-status')).toHaveText('Darry is picking his answer...');
    await expect(page.getByTestId('machine-A')).toBeDisabled();

    const rounds = await playWholeGame(page);
    await expect(page.getByTestId('final-numbers')).toBeVisible({ timeout: 60_000 });

    expect(interpretCalls, 'skipping asks for no interpretation').toHaveLength(0);
    expect(predictCalls.length, 'fifteen predictions and no more').toBe(TOTAL_ROUNDS);

    const expectedCorrect = rounds.filter((round) => round.prediction === round.choice).length;
    const expectedDarry = Math.round((expectedCorrect / TOTAL_ROUNDS) * 100);
    await expect(page.getByTestId('score-darry')).toHaveText(`${expectedDarry}%`);
    await expect(page.getByTestId('score-you')).toHaveText(`${100 - expectedDarry}%`);

    // The ordering guarantee holds on this path too.
    const timeline = (await readOrderingTimeline(page)).filter((event) => event.type !== 'installed');
    const unlocks = timeline.filter((event) => event.type === 'machines-enabled');
    expect(unlocks).toHaveLength(TOTAL_ROUNDS);
    for (const unlock of unlocks) expect(unlock.status).toBe('Darry has picked his answer.');
  });
});
