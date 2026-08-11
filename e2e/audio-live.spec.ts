import { expect, test } from '@playwright/test';
import { SEED, enterFromBoot, playRound, playWholeGame } from './helpers';

/**
 * Live audio verification against the real media element.
 *
 * Chromium is launched with autoplay permitted so playback actually starts; every
 * assertion reads the real `<audio>` element — its src, paused state, volume and
 * position — rather than any application state.
 *
 * What this suite is really proving is continuity: one element, created once, never
 * paused between the menu and the last round, sliding only in volume.
 */

interface Track {
  src: string;
  paused: boolean;
  volume: number;
  currentTime: number;
  loop: boolean;
}

/** Loud at the front, markedly quieter in play. Mirrors the controller's constants. */
const MENU_GAIN = 0.95;
const GAME_GAIN = 0.24;

const read = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('audio'));
    return {
      count: nodes.length,
      tracks: nodes.map((node) => ({
        src: node.src,
        paused: node.paused,
        volume: node.volume,
        currentTime: node.currentTime,
        loop: node.loop,
      })),
    };
  });

/** The one track. Fails loudly if a second element ever appears. */
async function track(page: import('@playwright/test').Page): Promise<Track> {
  const state = await read(page);
  expect(state.count, 'exactly one media element').toBe(1);
  expect(state.tracks[0].src, 'the only asset is the static').toContain('menu-static.m4a');
  return state.tracks[0];
}

/**
 * Wait for the position to pass a mark.
 *
 * Polled rather than sampled once: a streaming element can stall briefly while it
 * buffers, and a fixed window turns that into a false failure. The property under
 * test is that playback continued from where it was — never that it advanced within
 * some exact number of milliseconds.
 */
async function expectProgressPast(
  page: import('@playwright/test').Page,
  mark: number,
  what: string,
): Promise<void> {
  await expect
    .poll(async () => (await track(page)).currentTime, { timeout: 10_000, message: what })
    .toBeGreaterThan(mark);
}

test('the whole audio journey, on one real element', async ({ page }) => {
  test.setTimeout(240_000);

  // 1. Hard refresh: silence, and no element at all.
  await page.goto(`/?seed=${SEED}`);
  await page.getByTestId('boot-bar').waitFor();
  const boot = await read(page);
  console.log('1. boot →', JSON.stringify(boot));
  expect(boot.count, 'no audio element exists during boot').toBe(0);

  // 2. ENTER: the static starts, loud, and loops.
  await enterFromBoot(page);
  await page.waitForTimeout(1200);
  let now = await track(page);
  console.log('2. after ENTER →', JSON.stringify(now));
  expect(now.paused, 'the static is playing').toBe(false);
  expect(now.loop, 'it loops for the whole session').toBe(true);
  expect(now.volume).toBeGreaterThan(0.85);
  expect(now.volume).toBeCloseTo(MENU_GAIN, 2);

  // 3. ABOUT and SETTINGS stay loud and never restart it.
  const beforePopups = now.currentTime;
  await page.getByTestId('menu-about').click();
  await page.waitForTimeout(500);
  now = await track(page);
  console.log('3. about open →', JSON.stringify(now));
  expect(now.paused).toBe(false);
  expect(now.volume).toBeCloseTo(MENU_GAIN, 2);
  await expectProgressPast(page, beforePopups, 'playback continued through the popup');
  await page.getByTestId('about-back').click();

  await page.getByTestId('menu-settings').click();
  await page.waitForTimeout(300);
  now = await track(page);
  expect(now.paused, 'settings does not stop the static').toBe(false);
  expect(now.volume, 'settings does not quieten it either').toBeCloseTo(MENU_GAIN, 2);

  // 4. Music OFF mutes it; ON brings it back to the same loud level.
  await page.getByTestId('music-off').click();
  await page.waitForTimeout(700);
  now = await track(page);
  console.log('4. music off →', JSON.stringify(now));
  expect(now.volume).toBe(0);

  await page.getByTestId('music-on').click();
  await page.waitForTimeout(800);
  now = await track(page);
  console.log('   music on →', JSON.stringify(now));
  expect(now.volume).toBeCloseTo(MENU_GAIN, 2);
  await page.getByTestId('settings-back').click();

  // 5. PLAY NOW opens the warning and changes nothing. The warning is still the front
  //    of the house: full volume, for as long as it is left open.
  const beforePlay = (await track(page)).currentTime;
  await page.getByTestId('play-now').click();
  await page.getByTestId('consent').waitFor();
  await page.waitForTimeout(2400);
  now = await track(page);
  console.log('5. warning open →', JSON.stringify(now));
  expect(now.paused, 'still the same playback').toBe(false);
  await expectProgressPast(page, beforePlay, 'never restarted by PLAY NOW');
  expect(now.volume, 'the warning is read at full volume').toBeCloseTo(MENU_GAIN, 2);

  // 6. BACK: no volume change at all on the way out.
  await page.getByTestId('consent-back').click();
  await page.waitForTimeout(2400);
  now = await track(page);
  console.log('6. back to menu →', JSON.stringify(now));
  expect(now.paused).toBe(false);
  await expectProgressPast(page, beforePlay, 'never restarted by BACK');
  expect(now.volume, 'BACK retains the menu level').toBeCloseTo(MENU_GAIN, 2);

  // 7. Accepting is the moment it drops — and only then.
  await page.getByTestId('play-now').click();
  await page.getByTestId('consent').waitFor();
  const beforeAccept = await track(page);
  expect(beforeAccept.volume, 'still loud right up to the click').toBeCloseTo(MENU_GAIN, 2);

  await page.getByTestId('consent-accept').click();
  await page.waitForTimeout(2000);
  const atChoice = await track(page);
  console.log('7. after I UNDERSTAND. CONTINUE. →', JSON.stringify(atChoice));
  expect(atChoice.volume).toBeCloseTo(GAME_GAIN, 3);
  expect(atChoice.paused, 'the drop is a fade, not a stop').toBe(false);
  await expectProgressPast(page, beforeAccept.currentTime, 'the drop is not a restart');

  await page.getByTestId('skip-assessment').click();
  await page.getByTestId('darry-status').waitFor();
  const atBooth = await track(page);
  console.log('   booth →', JSON.stringify(atBooth));
  expect(atBooth.paused).toBe(false);
  expect(atBooth.volume).toBe(atChoice.volume);

  // A few rounds later it is still on exactly the same number: no breathing, no
  // pulsing, no random modulation.
  await playRound(page, 'A');
  await page.getByTestId('next-round').click();
  await playRound(page, 'B');
  await page.getByTestId('next-round').click();
  const midGame = await track(page);
  console.log('   three rounds in →', JSON.stringify(midGame));
  expect(midGame.volume, 'the level never moves during play').toBe(atBooth.volume);
  expect(midGame.paused).toBe(false);

  await playWholeGame(page, 3);

  // 8. Results loading: a long fade to nothing, then paused and rewound.
  await page.getByTestId('loading-results').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(4200);
  now = await track(page);
  console.log('8. after results fade →', JSON.stringify(now));
  expect(now.volume).toBe(0);
  expect(now.paused).toBe(true);
  expect(now.currentTime).toBe(0);

  // 9. The verdict and the percentages are completely silent.
  await page.getByTestId('unfortunately').waitFor({ timeout: 45_000 });
  now = await track(page);
  expect(now.volume, '"Unfortunately." is silent').toBe(0);
  expect(now.paused).toBe(true);

  await page.getByTestId('final-numbers').waitFor({ timeout: 45_000 });
  now = await track(page);
  console.log('9. final numbers →', JSON.stringify(now));
  expect(now.volume).toBe(0);
  expect(now.paused).toBe(true);

  // 10. PLAY AGAIN: straight to the booth, the static running again from the top at
  //     the quiet level.
  await page.getByTestId('play-again').click();
  await page.getByTestId('darry-status').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2400);
  now = await track(page);
  console.log('10. play again →', JSON.stringify(now));
  expect(now.paused).toBe(false);
  expect(now.volume).toBeCloseTo(GAME_GAIN, 3);
  // Near the top of the recording: it was started again rather than resumed.
  expect(now.currentTime).toBeGreaterThan(0);
  expect(now.currentTime).toBeLessThan(15);
  // No menu, no boot, no warning on the way back in.
  await expect(page.getByTestId('play-now')).toHaveCount(0);
  await expect(page.getByTestId('consent')).toHaveCount(0);
});
