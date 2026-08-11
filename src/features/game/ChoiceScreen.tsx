'use client';

/**
 * The fork: answer questions so Darry can learn you first, or walk straight into
 * the booth and let it learn you as you play.
 */

import { Screen } from '@/components/Screen';
import styles from './ChoiceScreen.module.css';

export function ChoiceScreen({
  onBegin,
  onSkip,
  busy,
}: {
  onBegin: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <Screen>
      <div className={`${styles.stack} fade-in`}>
        <h1 className="headline">Begin your assessment</h1>

        <div className={styles.body}>
          <p>Answer a series of questions so Darry can understand your pattern.</p>
          <p>There are no correct answers. Be truthful. Darry learns faster when you are.</p>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={onBegin} disabled={busy} data-testid="begin-assessment">
            begin assessment
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={onSkip}
            disabled={busy}
            data-testid="skip-assessment"
          >
            skip to the game
          </button>
        </div>
      </div>
    </Screen>
  );
}
