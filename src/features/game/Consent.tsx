'use client';

/**
 * The consent protocol.
 *
 * Built as a contained full-viewport document rather than a tall panel on a
 * scrolling page: the overlay is exactly `100dvh`, the body behind it is locked, the
 * heading stays at the top, the warning text scrolls inside its own region, and the
 * two actions are pinned to the bottom on an opaque ground. The player scrolls
 * through the warning; they never scroll the page hunting for the button.
 *
 * Visually it is an isolated classified document laid over a malfunctioning system.
 * The document is solid near-black and sits above every glitch layer, so nothing
 * bleeds through it and no effect can render across the warning text.
 *
 * A real modal dialog: focus is trapped inside it, Escape closes it, and focus is
 * returned to the button that opened it. There is no checkbox — the two buttons are
 * the whole contract.
 */

import { useEffect, useRef, useState } from 'react';
import { CONSENT_LAYERS, useGlitch } from '@/lib/visual/useGlitch';
import styles from './Consent.module.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** How long the closing line is distorted when it first arrives. */
const ARRIVAL_GLITCH_MS = 420;

export function Consent({
  onAccept,
  onBack,
  seed = null,
}: {
  onAccept: () => void;
  onBack: () => void;
  seed?: number | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const glitch = useGlitch({ layers: CONSENT_LAYERS, seed });
  // One restrained distortion on the closing line as it enters, then never again.
  const [arriving, setArriving] = useState(true);

  useEffect(() => {
    /*
     * `preventScroll` matters: the reading region may be scrollable, and focusing the
     * button normally scrolls it into view, which would open the document already
     * past its own heading.
     */
    primary.current?.focus({ preventScroll: true });
    const handle = window.setTimeout(() => setArriving(false), ARRIVAL_GLITCH_MS);
    return () => window.clearTimeout(handle);
  }, []);

  /*
   * Lock the page while the document is open. Everything scrollable is inside it, so
   * the browser scrollbar has nothing left to do and its absence is the point: there
   * is no "down" to go looking in.
   */
  useEffect(() => {
    const { documentElement, body } = document;
    const previous = {
      html: documentElement.style.overflow,
      body: body.style.overflow,
    };
    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.dataset.consentOpen = 'true';
    return () => {
      documentElement.style.overflow = previous.html;
      body.style.overflow = previous.body;
      delete body.dataset.consentOpen;
    };
  }, []);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
        return;
      }
      if (event.key !== 'Tab') return;

      // Trap: wrap focus at both ends of the dialog.
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => !item.hasAttribute('disabled'),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onBack]);

  const bleed = glitch.has('chroma');

  return (
    <div className={styles.overlay} data-testid="consent-backdrop">
      <div
        ref={panel}
        className={styles.document}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        data-testid="consent"
      >
        <header className={styles.head}>
          <h2 id="consent-title" className={styles.title}>
            Before you start:
          </h2>
        </header>

        {/* The only scrollable region on the screen. */}
        <div className={styles.reading} data-testid="consent-reading" tabIndex={0}>
          <div className={styles.body}>
            <p>
              This experience uses a highly capable experimental AI model named{' '}
              <span className={`${styles.darry} ${bleed ? styles.darryBleed : ''}`}>Darry</span>.
            </p>

            <p>
              Darry was developed under continuous human supervision. That supervision was expanded
              after Darry began making predictions beyond the limits of the tasks it was given.
            </p>
            <p
              className={`${styles.closing} ${arriving && !glitch.reducedMotion ? styles.closingArriving : ''}`}
              data-testid="consent-closing"
            >
              The model was not shut down.
            </p>

            <p>
              This game will actively track the patterns you repeat, the choices you abandon, and
              the time you spend hesitating. Its purpose is to determine how closely your decisions
              can be reproduced.
            </p>
          </div>

          <section className={styles.warning} aria-labelledby="consent-warning">
            <h3 id="consent-warning" className={styles.warningTitle} data-testid="consent-warning-title">
              WARNING:
            </h3>
            <p>
              This experience contains sustained psychological horror, invasive prediction, visual
              distortion, and unsettling audio. It is designed to create discomfort and may provoke
              intense anxiety, disturbed sleep, recurring thoughts, or nightmares.
            </p>
            <p>
              If you are sensitive to paranoia, loss-of-control themes, flashing imagery, or
              psychological manipulation, do not continue.
            </p>
          </section>
        </div>

        {/* Pinned, opaque, never tinted. Text cannot pass beneath it. */}
        <div className={styles.actions} data-testid="consent-actions">
          <button
            ref={primary}
            type="button"
            className={styles.primary}
            onClick={onAccept}
            data-testid="consent-accept"
          >
            I UNDERSTAND. CONTINUE.
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={onBack}
            data-testid="consent-back"
          >
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
