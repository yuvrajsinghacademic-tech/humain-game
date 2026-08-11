'use client';

import { Modal } from './Modal';
import styles from './About.module.css';

/** What the game is, in three sentences. The menu static keeps playing behind it. */
export function About({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="ABOUT" titleId="about-title" onClose={onClose} testId="about">
      <div className={styles.body}>
        <p>hum(ai)n is a psychological prediction game.</p>
        <p>
          Complete a behavioral assessment, then enter the Prediction Booth. An
          artificial intelligence named <span className={styles.darry}>Darry</span> studies
          how you choose, hesitate, repeat, and switch—then attempts to reproduce your
          decisions before you make them.
        </p>
        <p>Fifteen choices determine whether anything you do still belongs only to you.</p>
      </div>
    </Modal>
  );
}
