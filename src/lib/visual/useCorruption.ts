'use client';

/**
 * Controlled text corruption.
 *
 * Swaps one or two glyphs of a string for look-alike garbage, briefly, on an
 * occasional schedule — not constantly, and never fast enough to read as a flash.
 * The corrupted value is only ever rendered inside an `aria-hidden` element; the
 * accessible name always comes from the clean text.
 *
 * Under `prefers-reduced-motion` this returns the clean text and never schedules
 * anything, so there is no flicker at all.
 */

import { useEffect, useRef, useState } from 'react';

/** Glyphs that read as corruption in a monospace face without changing metrics. */
const GARBAGE = '▚▞█▓▒░#%&@$/\\|<>=+*';

export interface CorruptionOptions {
  /** Roughly how many corruption events per minute. */
  perMinute?: number;
  /** How long a corrupted frame is held, in milliseconds. */
  holdMs?: number;
  /** How many glyphs are replaced at once. */
  glyphs?: number;
}

function corrupt(text: string, glyphs: number, random: () => number): string {
  if (text.length === 0) return text;
  const characters = text.split('');
  const swaps = Math.min(glyphs, characters.length);
  for (let i = 0; i < swaps; i += 1) {
    const at = Math.floor(random() * characters.length);
    characters[at] = GARBAGE[Math.floor(random() * GARBAGE.length)];
  }
  return characters.join('');
}

export function useCorruption(text: string, options: CorruptionOptions = {}): string {
  const { perMinute = 8, holdMs = 90, glyphs = 1 } = options;
  /*
   * Only the transient override is state; the clean text is a prop. The override
   * records which text it was generated from, so a stale corrupted frame is simply
   * ignored when the text changes rather than needing an effect to reset it.
   */
  const [override, setOverride] = useState<{ for: string; value: string } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (perMinute <= 0) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    const meanGap = 60_000 / perMinute;

    const schedule = () => {
      // Jittered so the rhythm never becomes predictable.
      const delay = meanGap * (0.55 + Math.random() * 0.9);
      const handle = window.setTimeout(() => {
        if (cancelled) return;
        setOverride({ for: text, value: corrupt(text, glyphs, Math.random) });
        const restore = window.setTimeout(() => {
          if (cancelled) return;
          setOverride(null);
          schedule();
        }, holdMs);
        timers.current.push(restore);
      }, delay);
      timers.current.push(handle);
    };

    schedule();

    return () => {
      cancelled = true;
      timers.current.forEach((handle) => window.clearTimeout(handle));
      timers.current = [];
    };
  }, [text, perMinute, holdMs, glyphs]);

  return override?.for === text ? override.value : text;
}

/** Pure form, for tests. */
export const corruptText = corrupt;
