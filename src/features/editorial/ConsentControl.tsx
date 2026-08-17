'use client';

/**
 * The advertising privacy control — a detector first, a button only if there is
 * genuinely something to press.
 *
 * There is no consent management platform on this site, because there is no
 * advertising on it. A convincing-looking control that did nothing would be worse
 * than none at all: somebody would press it and come away believing they had
 * exercised a choice they had not.
 *
 * ## What this does and does not assume
 *
 * It looks for **one** entry point: `googlefc.showRevocationMessage`, which is the
 * documented way to reopen a message published through Google's Privacy & messaging
 * tool. If that function is present, the control is real. If it is not, the page says
 * so.
 *
 * It deliberately does **not**:
 *
 *  - **Assume the API will be here once AdSense is configured.** `googlefc` is
 *    installed by Google's own tag, and this page carries no advertising and loads no
 *    Google script — so on this route it may well never appear, even with a published
 *    message and a fully approved account. Whether it does is a fact about the
 *    production configuration, and it has to be *checked* rather than predicted. See
 *    the verification step in `docs/MONETIZATION.md`.
 *  - **Load anything to make itself work.** Pulling in an advertising or messaging
 *    script on the privacy page in order to light up a privacy button would be an
 *    absurd trade, and it is not made here.
 *  - **Claim to drive a generic TCF platform.** An earlier version detected
 *    `__tcfapi` and called `displayConsentUi` on it. That command is not part of the
 *    TCF v2 specification; on a real CMP it would have returned failure and opened
 *    nothing, which is exactly the inert-button problem this component exists to
 *    avoid. Detection of an API is not the same as a documented way to reopen it.
 *
 * Everything here is defensive: a missing `googlefc`, a `googlefc` that is not an
 * object, a `showRevocationMessage` that is not a function, and one that throws when
 * called are all handled, and none of them produce an error a visitor can see.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import styles from './Editorial.module.css';

/** The only shape this component knows how to drive. */
interface GoogleFundingChoices {
  showRevocationMessage?: unknown;
}

/**
 * The reopen function, or null.
 *
 * Read from `window` at every call rather than captured once, so the control always
 * drives whatever is actually loaded at the moment of the press.
 */
function findRevocationControl(): (() => void) | null {
  if (typeof window === 'undefined') return null;

  const googlefc = (window as unknown as { googlefc?: GoogleFundingChoices }).googlefc;
  const reopen = googlefc?.showRevocationMessage;
  if (typeof reopen !== 'function') return null;

  return () => (reopen as () => void).call(googlefc);
}

/**
 * Watch for the control appearing.
 *
 * A poll rather than a single check on mount: consent scripts load asynchronously,
 * and a component that looked once would decide "absent" a moment too early and never
 * correct itself. Twice a second for fifteen seconds, then it stops — a tool that has
 * not arrived by then is not coming, and a timer running forever on a static document
 * is litter.
 *
 * This is the *guard*, not an expectation. On a page with no advertising the poll is
 * expected to find nothing, and that is a correct outcome rather than a failure.
 */
function subscribeToRevocationControl(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let present = findRevocationControl() !== null;
  let elapsed = 0;

  const timer = window.setInterval(() => {
    elapsed += 500;
    const now = findRevocationControl() !== null;
    if (now !== present) {
      present = now;
      onChange();
    }
    if (elapsed >= 15_000 || now) window.clearInterval(timer);
  }, 500);

  return () => window.clearInterval(timer);
}

const controlPresent = () => findRevocationControl() !== null;
/** Absent during server rendering, which is also the correct answer without scripting. */
const noControlOnServer = () => false;

export function ConsentControl() {
  const hasControl = useSyncExternalStore(
    subscribeToRevocationControl,
    controlPresent,
    noControlOnServer,
  );
  const [failed, setFailed] = useState(false);

  const open = useCallback(() => {
    const reopen = findRevocationControl();
    if (!reopen) {
      // Vanished between render and click. Rare, but not a reason to throw.
      setFailed(true);
      return;
    }
    try {
      reopen();
      setFailed(false);
    } catch {
      // A provider error is the provider's problem; the page must not break over it.
      setFailed(true);
    }
  }, []);

  if (!hasControl) {
    return (
      <p className={styles.notice} data-testid="consent-control-absent">
        No advertising is running on this site, so there is no consent choice to revisit and
        nothing here to reopen. If that changes, a control will appear in this position — and if
        it does not, the browser and account controls described below are the ones that apply.
      </p>
    );
  }

  return (
    <>
      <p>
        <button type="button" className="btn" onClick={open} data-testid="consent-control">
          PRIVACY AND COOKIE SETTINGS
        </button>
      </p>
      {failed ? (
        <p className={styles.notice} role="status" data-testid="consent-control-failed">
          That control could not be opened. The browser and account controls described below
          still apply.
        </p>
      ) : null}
    </>
  );
}
