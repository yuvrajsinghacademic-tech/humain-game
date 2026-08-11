import { expect, type Page } from '@playwright/test';

/** Questions in the assessment. Mirrors `TRIAL_COUNT`. */
export const QUESTION_COUNT = 24;
/** Rounds in one complete game. Mirrors `TOTAL_ROUNDS`. */
export const TOTAL_ROUNDS = 15;
/** Fixed seed so a run is reproducible. Requires `NEXT_PUBLIC_ALLOW_SEED=true`. */
export const SEED = 20260810;

/**
 * Boot → ENTER → main menu.
 *
 * The loading bar runs for up to 2.8s and ENTER only exists once it finishes, so this
 * waits for the button rather than assuming it is there.
 */
export async function enterFromBoot(page: Page): Promise<void> {
  await expect(page.getByTestId('boot-bar')).toBeVisible();
  await expect(page.getByTestId('enter')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('enter').click();
  await expect(page.getByTestId('play-now')).toBeVisible();
}

/** Menu → PLAY NOW → warning → accepted → the fork. */
export async function acceptConsent(page: Page): Promise<void> {
  await page.getByTestId('play-now').click();
  await expect(page.getByTestId('consent')).toBeVisible();
  await page.getByTestId('consent-accept').click();
  await expect(page.getByRole('heading', { name: 'Begin your assessment' })).toBeVisible();
}

/** The whole run-up: boot, ENTER, menu, PLAY NOW, warning accepted. */
export async function startGame(page: Page): Promise<void> {
  await enterFromBoot(page);
  await acceptConsent(page);
}

/**
 * Answer the assessment, always taking the left-hand option.
 *
 * Advance is detected from the question counter rather than from the button being
 * re-enabled: after the final question there is no next question, so waiting on
 * the button would time out against an interface that is behaving correctly.
 * Darry's interruptions cover the screen between questions, so the loop waits for
 * the option to come back rather than assuming it is always there.
 */
export async function answerAllQuestions(page: Page, total = QUESTION_COUNT): Promise<void> {
  const counter = page.getByTestId('question-counter');

  for (let question = 0; question < total; question += 1) {
    const option = page.getByTestId('question-option-0');
    await expect(option).toBeVisible({ timeout: 20_000 });
    await expect(option).toBeEnabled();

    const before = await counter.innerText();
    await option.click();

    if (question < total - 1) {
      await expect(counter).not.toHaveText(before, { timeout: 20_000 });
    }
  }
}

/** Play one booth round, returning what Darry predicted and what was chosen. */
export async function playRound(
  page: Page,
  choice: 'A' | 'B',
): Promise<{ prediction: string; choice: 'A' | 'B' }> {
  const status = page.getByTestId('darry-status');
  await expect(status).toHaveText('Darry has picked his answer.', { timeout: 30_000 });

  const machine = page.getByTestId(`machine-${choice}`);
  await expect(machine).toBeEnabled();
  await machine.click();

  await expect(page.getByTestId('round-result')).toBeVisible({ timeout: 30_000 });
  const result = (await page.getByTestId('round-result').innerText()).trim();
  const prediction = /Darry chose ([AB])\./.exec(result)?.[1] ?? '';
  return { prediction, choice };
}

/**
 * Play the booth out from `from` to the last round, alternating so Darry is
 * genuinely tested rather than fed a constant.
 *
 * Note that this clicks `next round` after the final round too, which leaves the
 * booth for the ending — so anything that needs to read the booth UI (the coin
 * total, for instance) has to do it before calling this.
 */
export async function playWholeGame(
  page: Page,
  from = 1,
): Promise<Array<{ prediction: string; choice: 'A' | 'B' }>> {
  const rounds: Array<{ prediction: string; choice: 'A' | 'B' }> = [];
  for (let round = from; round <= TOTAL_ROUNDS; round += 1) {
    rounds.push(await playRound(page, round % 3 === 0 ? 'B' : 'A'));
    await page.getByTestId('next-round').click();
  }
  return rounds;
}

export interface OrderingEvent {
  type: 'installed' | 'sealed' | 'machines-enabled';
  t: number;
  /** For `machines-enabled`: what Darry's status said at that instant. */
  status?: string;
}

/**
 * Install a DOM-mutation probe recording the ordering of two events: a prediction
 * being sealed, and the machines becoming usable.
 *
 * Sampling `isDisabled()` from the test cannot prove this — the seal can land
 * between two Playwright round-trips, so a poll may miss the window and report a
 * false failure. A MutationObserver installed before the app boots sees every
 * transition in order, whatever the timing.
 *
 * The commitment hash is no longer rendered anywhere, so the sealed event is
 * detected from the status text changing to Darry's "has picked" line — which the
 * state machine only reaches on a genuine sealed ticket.
 *
 * Must be called before `page.goto`.
 */
export async function installOrderingProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const events: OrderingEvent[] = [];
    (window as unknown as { __humainOrdering: OrderingEvent[] }).__humainOrdering = events;

    const statusText = () =>
      document.querySelector('[data-testid="darry-status"]')?.textContent?.trim() ?? 'absent';

    const SEALED = 'Darry has picked his answer.';
    let lastStatus = '';

    const noteStatus = () => {
      const current = statusText();
      if (current === lastStatus) return;
      lastStatus = current;
      if (current === SEALED) events.push({ type: 'sealed', t: performance.now() });
    };

    const noteEnabled = () => {
      events.push({ type: 'machines-enabled', t: performance.now(), status: statusText() });
    };

    let machinesWereEnabled = false;
    const checkMachines = () => {
      const machine = document.querySelector('[data-testid="machine-A"]');
      if (!machine) {
        machinesWereEnabled = false;
        return;
      }
      const enabled = !machine.hasAttribute('disabled');
      if (enabled && !machinesWereEnabled) noteEnabled();
      machinesWereEnabled = enabled;
    };

    const observer = new MutationObserver(() => {
      noteStatus();
      checkMachines();
    });

    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled'],
    });

    events.push({ type: 'installed', t: performance.now() });
  });
}

export async function readOrderingTimeline(page: Page): Promise<OrderingEvent[]> {
  return page.evaluate(
    () => (window as unknown as { __humainOrdering: OrderingEvent[] }).__humainOrdering ?? [],
  );
}

/** Fail if the document can be scrolled sideways. */
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // One pixel of slack for sub-pixel rounding.
  expect(metrics.scrollWidth, `${where}: page must not scroll horizontally`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
}

/** Phrases that must never appear on a player-facing screen. */
export const BANNED_COPY = [
  'trial',
  'institute for applied behavioural inference',
  'instrument 04',
  'section one',
  'section two',
  'regularity above baseline',
  'sampling procedure',
  'your model',
  'the record shows',
  'assessment closed',
  'sealed prediction',
  'held server-side',
  'verified against',
  'stated confidence',
  'replacement viability',
  'remember me',
  'forget me',
  'payout rate undisclosed',
];

export async function expectNoBannedCopy(page: Page, where: string): Promise<void> {
  const text = ((await page.locator('body').innerText()) ?? '').toLowerCase();
  for (const phrase of BANNED_COPY) {
    expect(text.includes(phrase), `${where} must not contain "${phrase}"`).toBe(false);
  }
  // `seal` and `hash` are checked as whole words so they cannot hide inside another.
  expect(/\bseals?\b/.test(text), `${where} must not mention a seal`).toBe(false);
  expect(/\bhash(es)?\b/.test(text), `${where} must not mention a hash`).toBe(false);
}
