'use client';

/**
 * The post-assessment transition. Almost nothing.
 *
 * No analytics, no traits, no percentages, no explanation of smoothing. The
 * profile and Darry's reading of it are computed and kept internally for the
 * predictions and the ending; the player is told only that it happened.
 */

import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import styles from './ResultsTesting.module.css';

/** Beat between "tested" and "ready", so the two lines do not arrive together. */
const READY_DELAY_MS = 700;

export function ResultsTesting({ ready, onPlay }: { ready: boolean; onPlay: () => void }) {
  const [delayElapsed, setDelayElapsed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const handle = window.setTimeout(() => setDelayElapsed(true), READY_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [ready]);

  // Derived rather than mirrored, so the two can never disagree.
  const showReady = ready && delayElapsed;

  return (
    <Screen>
      <div className={styles.stack}>
        {!ready ? (
          <p className={styles.line} data-testid="testing-line">
            testing your results<span className="cursor" aria-hidden="true" />
          </p>
        ) : (
          <>
            <p className={`${styles.line} fade-in`} data-testid="tested-line">
              Your results have been tested.
            </p>
            {showReady ? (
              <>
                <p className={`${styles.ready} chroma fade-in`} data-testid="darry-ready">
                  Darry is ready.
                </p>
                <div className="actions actions--center fade-in">
                  <button type="button" className="btn" onClick={onPlay} data-testid="play-the-game">
                    play the game
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </Screen>
  );
}
