'use client';

/**
 * The wordmark. Always lowercase, always exactly `hum(ai)n`.
 *
 * `(ai)` is separated out so it can carry the error red and its own ambient
 * corruption — the machine is the part of the word that is wrong.
 *
 * The glitch props layer discrete failures on top of that. All of them are visual
 * only: the element is `role="img"` with a fixed `aria-label`, so however mangled
 * the glyphs get the accessible name stays `hum(ai)n`, and the duplicates and strips
 * contribute no second copy of the text.
 */

import { corruptText, useCorruption } from '@/lib/visual/useCorruption';
import styles from './Logo.module.css';

export interface LogoGlitch {
  /** Brief RGB separation. */
  chroma?: boolean;
  /** Large chromatic displacement. */
  chromaHard?: boolean;
  /** A displaced duplicate behind the word. 0..1 drives the offset. */
  ghost?: number;
  /** One or two corrupted glyphs. 0..1 drives which. */
  glyphs?: number;
  /** A small portion of the word nudged sideways. 0..1 drives band and offset. */
  nudge?: number;
  /** The word split into several offset strips. 0..1 drives the offsets. */
  strips?: number;
  /** The word resolving out of garbage, as if decoding. 0..1 drives the mangling. */
  decode?: number;
}

const WORD = 'hum(ai)n';
/** Horizontal bands the word is sliced into for the strips effect. */
const STRIP_BANDS = [0, 20, 40, 60, 80];

export function Logo({
  size = 'md',
  /** Ambient corruption events per minute. Zero disables it entirely. */
  restlessness = 8,
  glitch,
}: {
  size?: 'sm' | 'md' | 'lg';
  restlessness?: number;
  glitch?: LogoGlitch;
}) {
  const ai = useCorruption('(ai)', { perMinute: restlessness, holdMs: 90 });

  /*
   * `glyphs` and `decode` both corrupt the whole word, deterministically from the
   * event seed so a seeded run reproduces and a re-render never reshuffles the
   * glyphs. Neither leaves it unreadable: `glyphs` changes at most two of eight
   * characters, and `decode` runs for under 200ms. Cheap enough not to memoise.
   */
  const corrupted =
    glitch?.decode !== undefined
      ? corruptText(WORD, 4, seededRng(glitch.decode))
      : glitch?.glyphs !== undefined
        ? corruptText(WORD, 1 + Math.floor(glitch.glyphs * 2), seededRng(glitch.glyphs))
        : null;

  const nudgeOffset = glitch?.nudge === undefined ? 0 : (glitch.nudge - 0.5) * 16;
  const nudgeTop = glitch?.nudge === undefined ? 0 : 20 + glitch.nudge * 45;

  return (
    <span
      className={[
        styles.logo,
        styles[size],
        glitch?.chroma ? styles.chroma : '',
        glitch?.chromaHard ? styles.chromaHard : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label="hum(ai)n"
      data-testid="logo"
    >
      {/* The displaced duplicate. Decorative, and hidden from assistive tech. */}
      {glitch?.ghost !== undefined ? (
        <span
          className={styles.ghost}
          aria-hidden="true"
          data-testid="logo-ghost"
          style={{
            transform: `translate(${(glitch.ghost - 0.5) * 20}px, ${(glitch.ghost - 0.5) * 7}px)`,
          }}
        >
          hum<span className={styles.ai}>(ai)</span>n
        </span>
      ) : null}

      <span aria-hidden="true" className={styles.word}>
        {corrupted ? (
          <span data-testid="logo-corrupted">{corrupted}</span>
        ) : (
          <>
            hum<span className={styles.ai}>{ai}</span>n
          </>
        )}
      </span>

      {/* A small band of the word nudged sideways. */}
      {glitch?.nudge !== undefined ? (
        <span
          className={styles.slice}
          aria-hidden="true"
          data-testid="logo-nudge"
          style={{
            transform: `translateX(${nudgeOffset}px)`,
            clipPath: `inset(${nudgeTop}% 0 ${Math.max(0, 100 - nudgeTop - 16)}% 0)`,
          }}
        >
          hum<span className={styles.ai}>(ai)</span>n
        </span>
      ) : null}

      {/* The word split into offset strips, alternating direction. */}
      {glitch?.strips !== undefined
        ? STRIP_BANDS.map((top, index) => (
            <span
              key={`strip-${top}`}
              className={styles.slice}
              aria-hidden="true"
              data-testid="logo-strip"
              style={{
                transform: `translateX(${(index % 2 === 0 ? 1 : -1) * (4 + glitch.strips! * 20)}px)`,
                clipPath: `inset(${top}% 0 ${Math.max(0, 100 - top - 20)}% 0)`,
              }}
            >
              hum<span className={styles.ai}>(ai)</span>n
            </span>
          ))
        : null}
    </span>
  );
}

/** Tiny deterministic generator so a seeded glitch corrupts the same glyphs. */
function seededRng(seed: number): () => number {
  let state = Math.floor(seed * 1e6) + 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
