'use client';

/**
 * The shared modal shell for ABOUT and SETTINGS.
 *
 * A real dialog: focus moves inside on open, is trapped at both ends, Escape closes,
 * and the caller restores focus to whatever opened it. The surface is opaque
 * near-black so the menu static behind cannot interfere with reading — and the
 * scrolling is internal, so the page itself never moves.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  titleId,
  onClose,
  children,
  testId,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

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
  }, [onClose]);

  return (
    <div className={styles.overlay} data-testid={`${testId}-overlay`}>
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>

        <div className={styles.body}>{children}</div>

        <div className={styles.actions}>
          <button
            ref={close}
            type="button"
            className={styles.back}
            onClick={onClose}
            data-testid={`${testId}-back`}
          >
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
