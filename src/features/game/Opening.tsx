'use client';

/**
 * The opening viewport. A wordmark and one button.
 *
 * Nothing else belongs here — no institute, no estimate, no explanation. The only
 * thing the player can do is ask the question.
 *
 * Three glitch layers run over it continuously: constant micro interference, visible
 * medium faults, and a hard failure every several seconds that takes the whole centre
 * apart. The composition is handed to `GlitchStage` so it can be duplicated into
 * clipped, offset fragments — that is what makes the splits, bands and misplaced
 * wordmark hit the middle of the screen rather than the edges.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlitchStage } from '@/components/GlitchStage';
import { Logo } from '@/components/Logo';
import { corruptText } from '@/lib/visual/useCorruption';
import type { GlitchName } from '@/lib/visual/glitchScheduler';
import { OPENING_LAYERS, useGlitch } from '@/lib/visual/useGlitch';
import styles from './Opening.module.css';

/** How long the screen fails for before the consent panel appears. */
export const TRANSITION_FAILURE_MS = 260;
/** Hover and focus always provoke something; this stops it becoming a machine gun. */
const FLARE_COOLDOWN_MS = 1200;

const LABEL = 'will you be replaced?';

/** Effects the hover flare may choose from, hardest first. */
const FLARE_ORDER: GlitchName[] = ['chroma-hard', 'logo-strips', 'logo-ghost', 'chroma'];

export const Opening = forwardRef<HTMLButtonElement, { onBegin: () => void; seed?: number | null }>(
  function Opening({ onBegin, seed = null }, ref) {
    const glitch = useGlitch({ layers: OPENING_LAYERS, seed });
    const [failing, setFailing] = useState(false);
    const lastFlare = useRef(0);
    const timers = useRef<number[]>([]);

    useEffect(() => {
      const pending = timers.current;
      return () => pending.forEach((id) => window.clearTimeout(id));
    }, []);

    /**
     * Hover and focus always produce something noticeable — the first effect in the
     * list that the scheduler will accept — behind a short cooldown.
     */
    const flare = useCallback(() => {
      const now = Date.now();
      if (now - lastFlare.current < FLARE_COOLDOWN_MS) return;
      lastFlare.current = now;
      const order = glitch.reducedMotion ? ['chroma' as GlitchName] : FLARE_ORDER;
      for (const name of order) {
        if (glitch.fire(name)) return;
      }
    }, [glitch]);

    const handleBegin = useCallback(() => {
      // Reduced motion gets no tearing beat; it simply opens.
      if (glitch.reducedMotion) {
        onBegin();
        return;
      }
      setFailing(true);
      glitch.fire('split');
      timers.current.push(
        window.setTimeout(() => {
          setFailing(false);
          onBegin();
        }, TRANSITION_FAILURE_MS),
      );
    }, [glitch, onBegin]);

    const label = glitch.has('button-label') ? corruptText(LABEL, 3, Math.random) : LABEL;
    const skew = glitch.get('button-skew');

    const logoGlitch = {
      chroma: glitch.has('chroma'),
      chromaHard: glitch.has('chroma-hard'),
      ghost: glitch.get('logo-ghost')?.seed,
      glyphs: glitch.get('glyphs')?.seed,
      nudge: glitch.get('logo-nudge')?.seed,
      strips: glitch.get('logo-strips')?.seed,
      decode: glitch.get('decode')?.seed,
    };

    /**
     * The duplicate handed to the stage. Rendered without the live glitch props and
     * without the real button ref, so it is a plain visual copy.
     */
    const compositionCopy = useMemo(
      () => (
        <div className={styles.stack}>
          <span className={styles.mark}>
            <Logo size="lg" restlessness={0} />
          </span>
          <span className={`btn ${styles.enter}`}>{LABEL}</span>
        </div>
      ),
      [],
    );

    return (
      <GlitchStage
        active={glitch.active}
        reducedMotion={glitch.reducedMotion}
        seed={seed}
        composition={compositionCopy}
      >
        <main className="screen">
          <div className="column">
            <div className={`${styles.stack} fade-in-slow`} data-failing={String(failing)}>
              <h1 className={styles.mark}>
                <Logo size="lg" restlessness={14} glitch={logoGlitch} />
              </h1>

              <button
                ref={ref}
                type="button"
                className={`btn ${styles.enter}`}
                onClick={handleBegin}
                onMouseEnter={flare}
                onFocus={flare}
                // The accessible name never changes, however corrupted the glyphs get.
                aria-label={LABEL}
                data-testid="opening-button"
                style={
                  skew && !glitch.reducedMotion
                    ? {
                        transform: `translateX(${(skew.seed - 0.5) * 10}px) skewX(${(skew.seed - 0.5) * 2}deg)`,
                        borderColor: 'var(--red)',
                      }
                    : undefined
                }
              >
                <span aria-hidden="true">{label}</span>
              </button>
            </div>
          </div>
        </main>
      </GlitchStage>
    );
  },
);
