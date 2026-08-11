'use client';

/**
 * The prediction booth.
 *
 * The sealed-envelope machinery underneath is unchanged — the prediction is
 * generated, encrypted and committed to before the player can act, and the
 * commitment is verified after the reveal. None of that is on screen any more.
 * What the player sees is Darry deciding, then two machines becoming available.
 *
 * The one visible guarantee is the important one: while Darry is picking, both
 * machines are disabled, greyed out, and unreachable by pointer or keyboard.
 */

import { REWARD_COINS, TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import type { RevealedPrediction, Side } from '@/types';
import styles from './Booth.module.css';

export function Booth({
  round,
  picking,
  sealed,
  reveal,
  choice,
  lastWin,
  coins,
  onPull,
  onNext,
}: {
  round: number;
  /** True while Darry's request is in flight (or inside its minimum display time). */
  picking: boolean;
  /** True once a prediction has genuinely been sealed for this round. */
  sealed: boolean;
  reveal: RevealedPrediction | null;
  choice: Side | null;
  lastWin: boolean | null;
  coins: number;
  onPull: (side: Side) => void;
  onNext: () => void;
}) {
  const machinesLive = sealed && !reveal;

  return (
    <div className={styles.booth}>
      <header className={styles.head}>
        <h1 className={styles.title}>prediction booth</h1>
        <span className={styles.round} data-testid="round-counter">
          round {round} / {TOTAL_ROUNDS}
        </span>
      </header>

      {reveal ? (
        <div className={styles.result} data-testid="round-result">
          <p className={styles.resultLine}>Darry chose {reveal.prediction}.</p>
          <p className={styles.resultLine}>You chose {choice}.</p>
          <p
            className={`${styles.verdict} ${reveal.correct ? styles.verdictRight : styles.verdictWrong} ${
              reveal.correct ? 'chroma glitch-once' : ''
            }`}
            data-testid="verdict"
          >
            {reveal.correct ? 'Darry was correct.' : 'Darry was wrong.'}
          </p>
          <p className={styles.reward} data-testid="reward">
            {lastWin ? `+${REWARD_COINS}` : 'no reward'}
          </p>
        </div>
      ) : (
        <>
          <p
            className={`${styles.status} ${picking ? styles.statusPicking : styles.statusPicked}`}
            data-testid="darry-status"
            role="status"
            aria-live="polite"
          >
            {picking ? 'Darry is picking his answer...' : 'Darry has picked his answer.'}
          </p>
          {picking ? <span className={styles.working} aria-hidden="true" /> : null}
        </>
      )}

      <div className={styles.machines}>
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={styles.machine}
            data-testid={`machine-${side}`}
            data-chosen={String(choice === side)}
            disabled={!machinesLive}
            // Removed from the tab order entirely while Darry is deciding, so a
            // keyboard player cannot reach a machine before the prediction exists.
            tabIndex={machinesLive ? 0 : -1}
            aria-disabled={!machinesLive}
            onClick={() => onPull(side)}
          >
            <span className={styles.machineName}>machine {side.toLowerCase()}</span>
          </button>
        ))}
      </div>

      {reveal ? (
        <div className="actions actions--center">
          <button type="button" className="btn" onClick={onNext} data-testid="next-round">
            next round
          </button>
        </div>
      ) : null}

      <footer className={styles.foot}>
        <span className={styles.coins}>
          coins <b data-testid="coins">{coins}</b>
        </span>
        <span data-testid="darry-state">{picking ? 'darry: thinking' : 'darry: ready'}</span>
      </footer>
    </div>
  );
}
