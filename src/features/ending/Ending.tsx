'use client';

/**
 * The ending.
 *
 * Black, then a loading beat, then two lines delivered one at a time, then the
 * only two numbers that matter. No dashboard, no trait list, no disclaimer block,
 * no remember/forget.
 *
 * The sequence is staged rather than dumped: `Unfortunately.` lands alone, and
 * `You will be replaced.` arrives afterwards with the heavier glitch.
 */

import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import { endingCopy, endingNumbers } from '@/lib/behavior/ending';
import type { DebriefReport, RoundRecord } from '@/types';
import styles from './Ending.module.css';

/** Minimum time the loading state is held, even if the debrief returns sooner. */
export const LOADING_MIN_MS = 2000;
/** Pause between "Unfortunately." and the verdict. */
export const VERDICT_DELAY_MS = 1000;
/** Pause between the verdict and the numbers. */
export const NUMBERS_DELAY_MS = 900;

export function EndingLoading() {
  return (
    <Screen>
      <div className={styles.loading}>
        <p className={styles.loadingLine} data-testid="loading-results">
          loading results<span className="cursor" aria-hidden="true" />
        </p>
        <span className={styles.bar} aria-hidden="true" />
      </div>
    </Screen>
  );
}

type Stage = 'blank' | 'unfortunately' | 'verdict' | 'numbers';

export function Ending({
  rounds,
  report,
  onPlayAgain,
}: {
  rounds: readonly RoundRecord[];
  report: DebriefReport | null;
  onPlayAgain: () => void;
}) {
  const [stage, setStage] = useState<Stage>('blank');
  const numbers = endingNumbers(rounds);

  useEffect(() => {
    // A brief clear screen, then each beat in turn.
    const handles = [
      window.setTimeout(() => setStage('unfortunately'), 260),
      window.setTimeout(() => setStage('verdict'), 260 + VERDICT_DELAY_MS),
      window.setTimeout(() => setStage('numbers'), 260 + VERDICT_DELAY_MS + NUMBERS_DELAY_MS),
    ];
    return () => handles.forEach((handle) => window.clearTimeout(handle));
  }, []);

  const showUnfortunately = stage !== 'blank';
  const showVerdict = stage === 'verdict' || stage === 'numbers';
  const showNumbers = stage === 'numbers';

  return (
    <Screen>
      <div className={styles.ending}>
        {showUnfortunately ? (
          <p className={`${styles.unfortunately} fade-in`} data-testid="unfortunately">
            Unfortunately.
          </p>
        ) : null}

        {showVerdict ? (
          <p className={`${styles.verdict} chroma glitch-hard`} data-testid="verdict-line">
            You will be replaced.
          </p>
        ) : null}

        {showNumbers ? (
          <div className={`${styles.numbers} fade-in`} data-testid="final-numbers">
            <div className={styles.row}>
              <span className={styles.who}>you</span>
              <span className={styles.pct} data-testid="score-you">
                {numbers.you}%
              </span>
            </div>
            <div className={styles.row}>
              <span className={`${styles.who} red`}>Darry</span>
              <span className={`${styles.pct} red`} data-testid="score-darry">
                {numbers.darry}%
              </span>
            </div>

            <p className={styles.note} data-testid="ending-note">
              {endingCopy(rounds, report)}
            </p>

            <div className={styles.again}>
              {/* Exactly one player-facing occurrence. */}
              <button
                type="button"
                className={styles.againButton}
                onClick={onPlayAgain}
                data-testid="play-again"
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
