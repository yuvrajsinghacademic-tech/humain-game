'use client';

/**
 * The boot screen.
 *
 * True black and a thin loading bar. No logo, no title, no percentage, no text of any
 * kind — the bar is the entire interface. It advances irregularly, hesitates once or
 * twice, finishes on its own, holds briefly, fades, and is replaced by a single
 * button.
 *
 * That button is load-bearing rather than decorative: browsers refuse to start audio
 * without a user gesture, so ENTER is the gesture that unlocks the whole sound design.
 * Nothing plays before it.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/visual/clientOnly';
import styles from './Boot.module.css';

/** Total run time of the bar. */
const MIN_DURATION_MS = 1800;
const MAX_DURATION_MS = 2800;
/** How long the completed bar sits before it fades. */
export const HOLD_AFTER_COMPLETE_MS = 150;
/** Update cadence. Coarse enough that the steps read as stutter, not animation. */
const TICK_MS = 60;

interface Segment {
  /** Progress this segment climbs to, 0..1. */
  to: number;
  /** Milliseconds spent climbing. */
  climb: number;
  /** Milliseconds spent stalled at the top of it. */
  hesitate: number;
}

/**
 * Build an irregular climb: several uneven jumps with a couple of real pauses.
 *
 * Deliberately not linear and not smooth — a bar that fills evenly reads as a
 * progress animation, and this needs to read as something actually loading badly.
 */
function buildSegments(random: () => number, totalMs: number): Segment[] {
  const shape = [0.18, 0.34, 0.41, 0.63, 0.72, 0.88, 1];
  // Two of the middle stops hesitate; which two varies per boot.
  const hesitateAt = new Set<number>([
    1 + Math.floor(random() * 2),
    3 + Math.floor(random() * 3),
  ]);

  const weights = shape.map(() => 0.6 + random() * 0.9);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const hesitationBudget = totalMs * 0.3;
  const climbBudget = totalMs - hesitationBudget;

  return shape.map((to, index) => ({
    to,
    climb: (weights[index] / weightTotal) * climbBudget,
    hesitate: hesitateAt.has(index) ? hesitationBudget / hesitateAt.size : 0,
  }));
}

export function Boot({ onEnter }: { onEnter: () => void }) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const enterButton = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    const total = MIN_DURATION_MS + Math.random() * (MAX_DURATION_MS - MIN_DURATION_MS);
    const segments = buildSegments(Math.random, total);

    let index = 0;
    let from = 0;
    let segmentStart = performance.now();
    let stalling = false;

    const tick = () => {
      const segment = segments[index];
      if (!segment) return;
      const elapsed = performance.now() - segmentStart;

      if (stalling) {
        if (elapsed >= segment.hesitate) {
          stalling = false;
          index += 1;
          from = segment.to;
          segmentStart = performance.now();
          if (index >= segments.length) {
            finish();
            return;
          }
        }
      } else {
        const t = Math.min(1, elapsed / segment.climb);
        setProgress(from + (segment.to - from) * t);
        if (t >= 1) {
          if (segment.hesitate > 0) {
            stalling = true;
            segmentStart = performance.now();
          } else {
            index += 1;
            from = segment.to;
            segmentStart = performance.now();
            if (index >= segments.length) {
              finish();
              return;
            }
          }
        }
      }
      pending.push(window.setTimeout(tick, TICK_MS));
    };

    const finish = () => {
      setProgress(1);
      setComplete(true);
      // The full bar sits for a beat, then goes. ENTER takes focus on mount via
      // autoFocus rather than a timer, so a keyboard player can act immediately.
      pending.push(window.setTimeout(() => setBarVisible(false), HOLD_AFTER_COMPLETE_MS));
    };

    pending.push(window.setTimeout(tick, TICK_MS));

    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      pending.length = 0;
    };
  }, []);

  return (
    <main className={styles.boot}>
      {barVisible ? (
        <div
          className={`${styles.track} ${complete ? styles.trackComplete : ''}`}
          // A non-verbal progress role: announced as progress without adding any
          // visible text to a screen that is meant to have none.
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          data-testid="boot-bar"
          data-complete={String(complete)}
        >
          <div
            className={styles.fill}
            style={{ width: `${progress * 100}%`, transition: reducedMotion ? 'none' : undefined }}
          />
        </div>
      ) : (
        <button
          ref={enterButton}
          // The button replaces the only thing on screen, so taking focus is the
          // correct behaviour rather than a hijack.
          autoFocus
          type="button"
          className={styles.enter}
          onClick={onEnter}
          data-testid="enter"
        >
          ENTER
        </button>
      )}
    </main>
  );
}
