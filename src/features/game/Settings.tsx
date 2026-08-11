'use client';

/**
 * SETTINGS: music on/off, and a scare level.
 *
 * Music routes straight into the audio controller, which fades whichever track is
 * currently audible and never restarts the wrong one. Scare level is a presentation
 * setting held in memory for the lifetime of the tab — nothing behavioural is
 * persisted, and nothing else is added to storage.
 *
 * Both controls are radio groups so assistive technology gets the selected state
 * rather than three buttons that look identical to it.
 */

import { Modal } from './Modal';
import styles from './Settings.module.css';

export type ScareLevel = 'LOW' | 'MEDIUM' | 'HIGH';

const SCARE_LEVELS: ScareLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export function Settings({
  onClose,
  musicOn,
  onMusicChange,
  scareLevel,
  onScareLevelChange,
}: {
  onClose: () => void;
  musicOn: boolean;
  onMusicChange: (on: boolean) => void;
  scareLevel: ScareLevel;
  onScareLevelChange: (level: ScareLevel) => void;
}) {
  return (
    <Modal title="SETTINGS" titleId="settings-title" onClose={onClose} testId="settings">
      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.label} id="music-label">
            MUSIC
          </span>
          <div className={styles.options} role="radiogroup" aria-labelledby="music-label">
            {[true, false].map((on) => (
              <button
                key={on ? 'on' : 'off'}
                type="button"
                role="radio"
                aria-checked={musicOn === on}
                className={styles.option}
                data-selected={String(musicOn === on)}
                onClick={() => onMusicChange(on)}
                data-testid={`music-${on ? 'on' : 'off'}`}
              >
                {on ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label} id="scare-label">
            SCARE LEVEL
          </span>
          <div className={styles.options} role="radiogroup" aria-labelledby="scare-label">
            {SCARE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={scareLevel === level}
                className={styles.option}
                data-selected={String(scareLevel === level)}
                onClick={() => onScareLevelChange(level)}
                data-testid={`scare-${level.toLowerCase()}`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
