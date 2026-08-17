'use client';

/**
 * The share control.
 *
 * Everything here happens on the device. The text is composed locally from the two
 * numbers already on screen, handed either to the operating system's share sheet or
 * to the clipboard, and then forgotten. No result is uploaded, no link is minted, no
 * image is generated on a server, and there is nothing anywhere afterwards that says
 * a particular person played.
 *
 * Two controls rather than one, because the two do genuinely different things and one
 * of them is not always available:
 *
 *  - **COPY RESULT** works everywhere, including desktop Safari and every browser
 *    where the Web Share API is missing or refuses a text-only payload.
 *  - **SHARE** opens the device's own share sheet, which is what a phone user
 *    expects and what actually gets the link into a message thread. It appears only
 *    after the component has confirmed the API exists, which is also why the
 *    server-rendered markup and the first client render agree.
 *
 * No permission is requested at any point. `navigator.share` must be called inside
 * the click that triggered it, which is why nothing is awaited before it.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { track } from '@/lib/analytics/events';
import { shareClipboardText, shareData, type ShareableResult } from '@/lib/share/result';
import styles from './Ending.module.css';

type Status = 'idle' | 'copied' | 'unavailable';

/** Clipboard, with a fallback for browsers that refuse the async API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied, insecure context, or no permission: fall through */
  }

  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.setAttribute('readonly', '');
    // Off-screen but focusable. `display: none` cannot be selected.
    holder.style.position = 'fixed';
    holder.style.top = '-1000px';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(holder);
    return copied;
  } catch {
    return false;
  }
}

/*
 * Whether the browser has a share sheet, read as an external fact rather than derived
 * in an effect.
 *
 * `navigator.share` either exists when the script runs or never does, so the
 * subscription is a no-op — nothing will ever change it. The server snapshot is
 * `false`, which is what makes the server-rendered markup and the first client render
 * agree, and it is also the right answer without scripting: COPY RESULT alone.
 */
const NEVER_CHANGES = () => () => undefined;
const shareApiPresent = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const noShareApiOnServer = () => false;

export function ShareResult({ result }: { result: ShareableResult }) {
  const canShare = useSyncExternalStore(NEVER_CHANGES, shareApiPresent, noShareApiOnServer);
  const [status, setStatus] = useState<Status>('idle');

  const onCopy = useCallback(async () => {
    track('share_clicked', { method: 'clipboard' });
    const copied = await copyText(shareClipboardText(result));
    setStatus(copied ? 'copied' : 'unavailable');
  }, [result]);

  const onShare = useCallback(() => {
    track('share_clicked', { method: 'native' });
    try {
      // Not awaited: a rejection here is almost always the player dismissing the
      // sheet, which is not a failure and must not change what is on screen.
      void navigator.share?.(shareData(result)).catch(() => undefined);
    } catch {
      setStatus('unavailable');
    }
  }, [result]);

  return (
    <div className={styles.share} data-testid="share-result">
      <p className={styles.shareLabel}>Share your result</p>

      <div className={styles.shareActions}>
        <button type="button" className={styles.shareButton} onClick={onCopy} data-testid="share-copy">
          COPY RESULT
        </button>
        {canShare ? (
          <button
            type="button"
            className={styles.shareButton}
            onClick={onShare}
            data-testid="share-native"
          >
            SHARE
          </button>
        ) : null}
      </div>

      <p className={styles.shareStatus} role="status" aria-live="polite" data-testid="share-status">
        {status === 'copied' ? 'Copied.' : status === 'unavailable' ? 'Copying is blocked in this browser.' : ''}
      </p>
    </div>
  );
}
