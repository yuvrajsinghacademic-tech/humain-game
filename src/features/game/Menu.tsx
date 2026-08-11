'use client';

/**
 * The main menu — the title screen.
 *
 * The continuous atmosphere here is the television static, not the glitch system. The
 * old opening ran three glitch layers at once; a title screen that shreds itself
 * twice a second is exhausting and unreadable, so the menu gets a much quieter
 * repertoire: a small chromatic or glyph accent every four to eight seconds, a
 * moderate slice every twelve to twenty, and nothing else. The title stays legible
 * essentially all of the time.
 *
 * The louder repertoires are untouched and still available to later phases.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { TvStatic } from '@/components/TvStatic';
import { MENU_ACCENT_LAYERS, useGlitch } from '@/lib/visual/useGlitch';
import { About } from './About';
import { Settings } from './Settings';
import styles from './Menu.module.css';

export type MenuPopup = 'about' | 'settings' | null;

export function Menu({
  onPlay,
  musicOn,
  onMusicChange,
}: {
  onPlay: () => void;
  musicOn: boolean;
  onMusicChange: (on: boolean) => void;
}) {
  const glitch = useGlitch({ layers: MENU_ACCENT_LAYERS });
  const [popup, setPopup] = useState<MenuPopup>(null);
  /** Scare level is presentation-only, in memory, and deliberately not persisted. */
  const [scareLevel, setScareLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const aboutButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);

  // Focus returns to whichever button opened the modal.
  const closePopup = useCallback(() => {
    const opener = popup === 'about' ? aboutButton.current : settingsButton.current;
    setPopup(null);
    opener?.focus();
  }, [popup]);

  const handlePlay = useCallback(() => {
    // Any popup closes first, then the transition begins.
    setPopup(null);
    onPlay();
  }, [onPlay]);

  /** A small distortion when a menu button takes hover or focus. */
  const nudge = useCallback(() => {
    glitch.fire('chroma');
  }, [glitch]);

  useEffect(() => {
    // Nothing to clean up beyond the hook's own teardown; kept for clarity.
  }, []);

  return (
    <>
      <TvStatic opacity={0.055} />

      <main className={styles.menu}>
        <div className={styles.inner}>
          <h1 className={styles.title}>
            <Logo
              size="lg"
              restlessness={4}
              glitch={{
                chroma: glitch.has('chroma'),
                glyphs: glitch.get('glyphs')?.seed,
                nudge: glitch.get('logo-nudge')?.seed,
              }}
            />
          </h1>

          <nav className={styles.nav} aria-label="Main menu">
            <button
              type="button"
              className={styles.item}
              onClick={handlePlay}
              onMouseEnter={nudge}
              onFocus={nudge}
              data-testid="play-now"
            >
              PLAY NOW
            </button>
            <button
              ref={aboutButton}
              type="button"
              className={styles.item}
              onClick={() => setPopup('about')}
              onMouseEnter={nudge}
              onFocus={nudge}
              aria-haspopup="dialog"
              data-testid="menu-about"
            >
              ABOUT
            </button>
            <button
              ref={settingsButton}
              type="button"
              className={styles.item}
              onClick={() => setPopup('settings')}
              onMouseEnter={nudge}
              onFocus={nudge}
              aria-haspopup="dialog"
              data-testid="menu-settings"
            >
              SETTINGS
            </button>
          </nav>
        </div>
      </main>

      {popup === 'about' ? <About onClose={closePopup} /> : null}
      {popup === 'settings' ? (
        <Settings
          onClose={closePopup}
          musicOn={musicOn}
          onMusicChange={onMusicChange}
          scareLevel={scareLevel}
          onScareLevelChange={setScareLevel}
        />
      ) : null}
    </>
  );
}
