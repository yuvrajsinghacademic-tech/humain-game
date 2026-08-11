'use client';

/**
 * One question.
 *
 * Deliberately unexplained. A counter, a hairline progress rule, two abstract
 * options, and — only where the measurement requires it — a payoff figure or a
 * one-glyph reward response. No instruction sentence: the player can see there
 * are two things and that they must pick one.
 *
 * What is preserved from the previous version is everything the behavioural maths
 * needs: an accurate latency measured from when the question appears, an honest
 * deadline on timed questions, and a reward beat long enough to register, because
 * win-stay and lose-switch are worthless as measurements if the player never sees
 * whether a channel paid.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Glyph, GlyphSequence } from '@/components/Glyph';
import type { PreparedTrial } from '@/lib/behavior/trials';
import styles from './Question.module.css';

export interface QuestionOutcome {
  rewarded: boolean | null;
  coins: number;
}

export interface QuestionCommit extends QuestionOutcome {
  optionId: string;
  position: 'left' | 'right';
  responseMs: number;
  timedOut: boolean;
}

/** How long a reward response is held before the next question replaces it. */
const FEEDBACK_MS = 560;
/** Beat between an unrewarded answer and the next question. */
const ADVANCE_MS = 170;
/** Deadline refresh. Coarse on purpose: a pressure cue, not a clock. */
const TICK_MS = 80;

export function QuestionView({
  trial,
  index,
  total,
  onResolve,
  onCommit,
  onSound,
}: {
  trial: PreparedTrial;
  index: number;
  total: number;
  onResolve: (optionId: string) => QuestionOutcome;
  onCommit: (commit: QuestionCommit) => void;
  onSound: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<QuestionOutcome | null>(null);
  const [remaining, setRemaining] = useState(1);
  const startedAt = useRef(0);
  const settled = useRef(false);
  const timers = useRef<number[]>([]);

  const commit = useCallback(
    (optionId: string, position: 'left' | 'right', timedOut: boolean) => {
      if (settled.current) return;
      settled.current = true;
      const responseMs = Math.max(1, Math.round(performance.now() - startedAt.current));

      const resolved = onResolve(optionId);
      setPicked(optionId);
      setOutcome(resolved);
      if (!timedOut) onSound();

      const hold = resolved.rewarded === null ? ADVANCE_MS : FEEDBACK_MS;
      timers.current.push(
        window.setTimeout(
          () => onCommit({ ...resolved, optionId, position, responseMs, timedOut }),
          hold,
        ),
      );
    },
    [onCommit, onResolve, onSound],
  );

  /*
   * No per-question reset: the parent keys this component by question, so every
   * question is a fresh mount with fresh state and cannot fall out of sync with
   * the question it is showing. This only stamps the start time and clears timers.
   */
  useEffect(() => {
    startedAt.current = performance.now();
    const pending = timers.current;
    return () => {
      pending.forEach((handle) => window.clearTimeout(handle));
    };
  }, []);

  // Driven by an interval rather than a CSS animation so it still communicates
  // under `prefers-reduced-motion`, where animation is stilled.
  useEffect(() => {
    if (!trial.deadlineMs) return;
    const deadline = trial.deadlineMs;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const fraction = Math.max(0, 1 - (performance.now() - started) / deadline);
      setRemaining(fraction);
      if (fraction <= 0) {
        window.clearInterval(timer);
        // Nothing was chosen. Recorded as timed out, contributing no evidence.
        commit(trial.displayed[0].id, 'left', true);
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [trial.deadlineMs, trial.displayed, commit]);

  const positions: Array<'left' | 'right'> = ['left', 'right'];

  return (
    <div className={styles.question}>
      <div className={styles.head}>
        <span className={styles.counter} data-testid="question-counter">
          question {String(index + 1).padStart(2, '0')} / {total}
        </span>
        <span className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${(index / total) * 100}%` }} />
        </span>
      </div>

      {trial.sequence ? (
        <div className={styles.sequence}>
          <GlyphSequence marks={trial.sequence} />
        </div>
      ) : null}

      <div className={styles.options}>
        {trial.displayed.map((option, i) => (
          <button
            key={option.id}
            type="button"
            className={`${styles.option} unstable`}
            data-picked={String(picked === option.id)}
            data-testid={`question-option-${i}`}
            disabled={picked !== null}
            aria-label={accessibleName(option.label, option.id, trial)}
            onClick={() => commit(option.id, positions[i], false)}
          >
            <Glyph name={option.glyph} size={52} />
            {trial.wager ? (
              <span className={styles.value}>
                {option.id.endsWith(':safe') ? `${trial.wager.safe}` : `${trial.wager.risky} / 0`}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {trial.deadlineMs ? (
        <div className={styles.deadline} aria-hidden="true">
          <div className={styles.deadlineFill} style={{ width: `${remaining * 100}%` }} />
        </div>
      ) : (
        <div className={styles.deadlineSpacer} aria-hidden="true" />
      )}

      <div className={styles.response} aria-live="polite" data-testid="question-response">
        {outcome && outcome.rewarded !== null ? (
          outcome.rewarded ? (
            <span className={styles.paid}>+{outcome.coins}</span>
          ) : (
            <span className={styles.unpaid}>0</span>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * The accessible name carries what sighted players get from the layout: which
 * side the option is on, and — for a wager — what it pays. Screen-reader users
 * must not be handed a different question from everyone else.
 */
function accessibleName(label: string, optionId: string, trial: PreparedTrial): string {
  if (trial.wager) {
    return optionId.endsWith(':safe')
      ? `${label}, ${trial.wager.safe} guaranteed`
      : `${label}, ${trial.wager.risky} or nothing`;
  }
  return label;
}
