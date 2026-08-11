'use client';

/**
 * The assessment screen: a reserved reaction slot, then the question.
 *
 * The slot is always in the layout with a fixed height, whether or not anything is in
 * it, so a reaction appearing can never move the symbols. It is `pointer-events:
 * none` and never takes focus, and — the important part — showing one does not delay
 * the commit by a single millisecond: the handler passes straight through to the game
 * and the reaction simply happens alongside. A reaction may still be visible as the
 * next question arrives, which is preferred to pausing.
 *
 * This component owns the reaction rather than `QuestionView`, because `QuestionView`
 * is remounted per question and would take the reaction with it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { reactionAt, reactionDurationMs, type Reaction } from '@/lib/behavior/reactions';
import type { PreparedTrial } from '@/lib/behavior/trials';
import { QuestionView, type QuestionCommit, type QuestionOutcome } from './QuestionView';
import styles from './Assessment.module.css';

export function AssessmentScreen({
  trial,
  index,
  total,
  seed,
  onResolve,
  onCommit,
  onSound,
}: {
  trial: PreparedTrial;
  index: number;
  total: number;
  /** Deterministic reaction schedule. Null falls back to a fixed default seed. */
  seed: number | null;
  onResolve: (optionId: string) => QuestionOutcome;
  onCommit: (commit: QuestionCommit) => void;
  onSound: () => void;
}) {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [key, setKey] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const handleCommit = useCallback(
    (commit: QuestionCommit) => {
      // Hand the answer on first. Nothing about the reaction gates the game.
      onCommit(commit);

      const next = reactionAt(index, seed ?? 1, total);
      if (!next) return;

      setReaction(next);
      setKey((current) => current + 1);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setReaction(null),
        reactionDurationMs(index, seed ?? 1),
      );
    },
    [index, onCommit, seed, total],
  );

  return (
    <div className={styles.assessment}>
      {/*
        Reserved height, always present. A polite live region so the reaction is
        announced rather than being sighted-only, which never moves focus.
      */}
      <div className={styles.slot} data-testid="reaction-slot" role="status" aria-live="polite">
        {reaction ? (
          <span key={key} className={styles.reaction} data-testid="reaction">
            {reaction}
          </span>
        ) : null}
      </div>

      <QuestionView
        key={`${trial.id}-${index}`}
        trial={trial}
        index={index}
        total={total}
        onResolve={onResolve}
        onCommit={handleCommit}
        onSound={onSound}
      />
    </div>
  );
}
