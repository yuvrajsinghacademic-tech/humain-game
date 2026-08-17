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
 *
 * **The aftermath is a fifth stage, and it is late on purpose.** Sharing, playing
 * again and — if it is ever configured — an advertisement all live below a rule that
 * does not exist while the verdict is landing. The reveal gets the screen to itself
 * for a beat first, and only then does the piece admit it is on a website. Nothing in
 * that section is allowed to compete with the two percentages: it is smaller, dimmer,
 * and a long way down.
 */

import { useEffect, useState } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import { Screen } from '@/components/Screen';
import { endingCopy, endingNumbers } from '@/lib/behavior/ending';
import type { DebriefReport, RoundRecord } from '@/types';
import { ShareResult } from './ShareResult';
import styles from './Ending.module.css';

/** Minimum time the loading state is held, even if the debrief returns sooner. */
export const LOADING_MIN_MS = 2000;
/** Pause between "Unfortunately." and the verdict. */
export const VERDICT_DELAY_MS = 1000;
/** Pause between the verdict and the numbers. */
export const NUMBERS_DELAY_MS = 900;
/**
 * Pause between the numbers and everything that is not the game.
 *
 * Long enough that the two percentages are read before anything else appears, short
 * enough that nobody who wants to leave is kept waiting for the button that lets
 * them.
 */
export const AFTERMATH_DELAY_MS = 900;

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

type Stage = 'blank' | 'unfortunately' | 'verdict' | 'numbers' | 'aftermath';

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
      window.setTimeout(
        () => setStage('aftermath'),
        260 + VERDICT_DELAY_MS + NUMBERS_DELAY_MS + AFTERMATH_DELAY_MS,
      ),
    ];
    return () => handles.forEach((handle) => window.clearTimeout(handle));
  }, []);

  const showUnfortunately = stage !== 'blank';
  const showVerdict = stage === 'verdict' || stage === 'numbers' || stage === 'aftermath';
  const showNumbers = stage === 'numbers' || stage === 'aftermath';
  const showAftermath = stage === 'aftermath';

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
          </div>
        ) : null}

        {showAftermath ? (
          <section
            className={`${styles.aftermath} fade-in-slow`}
            aria-label="After the game"
            data-testid="aftermath"
          >
            <p className={styles.terminated}>Session terminated</p>

            <ShareResult
              result={{
                darry: numbers.darry,
                you: numbers.you,
                correct: numbers.correct,
                rounds: numbers.rounds,
              }}
            />

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

            {/*
              The only advertising surface anywhere near the game, and it is below the
              rule, below the share controls and below PLAY AGAIN, separated by a gap
              large enough that it cannot be reached for by accident. With no AdSense
              account configured it renders nothing at all — no element, no reserved
              space, no script.
            */}
            <div className={styles.advert}>
              <AdSlot surface="postgame" />
            </div>
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
