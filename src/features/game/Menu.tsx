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
import Link from 'next/link';
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

        {/*
          The site, as opposed to the game.

          Pinned to the very bottom of the title screen, at the smallest legible size,
          in the faintest colour the palette has — well outside the three options above
          and never in the same visual group as them. This has to exist: a site that
          shows advertising needs its policies reachable from the front page, and a
          player who wants to know what is being measured should not have to guess.

          Deliberately not labelled ABOUT. The menu already has an ABOUT, which opens
          the modal describing the game, and two controls with one word meaning two
          things would be worse than a slightly longer label. THE PROJECT leaves the
          game's own vocabulary alone.

          `prefetch={false}` on all three. Almost nobody arriving at a title screen is
          on their way to a privacy policy, and speculatively downloading three
          documents to make the rare case marginally faster is the wrong trade on a
          phone that has just scanned a code on a wall.
        */}
        <nav className={styles.site} aria-label="About this site">
          <Link className={styles.siteLink} href="/about" prefetch={false} data-testid="menu-site-about">
            THE PROJECT
          </Link>
          <span className={styles.siteDot} aria-hidden="true">
            ·
          </span>
          <Link className={styles.siteLink} href="/privacy" prefetch={false} data-testid="menu-site-privacy">
            PRIVACY
          </Link>
          <span className={styles.siteDot} aria-hidden="true">
            ·
          </span>
          <Link className={styles.siteLink} href="/terms" prefetch={false} data-testid="menu-site-terms">
            TERMS
          </Link>
        </nav>
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
