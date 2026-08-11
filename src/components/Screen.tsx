'use client';

/**
 * The persistent screen furniture: scanlines, noise, vignette, and a corner
 * wordmark once the game is under way.
 *
 * These layers are rendered once at the root and never re-mounted, so the texture
 * is continuous across every transition rather than restarting per screen.
 */

import type { ReactNode } from 'react';
import { Logo } from './Logo';
import styles from './Screen.module.css';

export function CrtLayers() {
  return (
    <>
      <div className="crt-lines" aria-hidden="true" />
      <div className="crt-noise" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
    </>
  );
}

/** The small wordmark that sits in the corner during the game. */
export function CornerMark({ muted, onToggleAudio }: { muted: boolean; onToggleAudio: () => void }) {
  return (
    <div className={styles.corner}>
      <Logo size="sm" restlessness={5} />
      <button
        type="button"
        className={styles.sound}
        onClick={onToggleAudio}
        aria-pressed={!muted}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      >
        {muted ? 'sound off' : 'sound on'}
      </button>
    </div>
  );
}

export function Screen({
  children,
  top = false,
  className = '',
}: {
  children: ReactNode;
  /** Anchor content to the top instead of centring it. */
  top?: boolean;
  className?: string;
}) {
  return (
    <main className={`screen ${top ? 'screen--top' : ''} ${className}`}>
      <div className="column">{children}</div>
    </main>
  );
}
