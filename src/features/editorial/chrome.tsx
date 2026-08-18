/**
 * The editorial chrome: a wordmark, four links, a footer.
 *
 * Server components, every one of them. There is no state here, nothing to hydrate,
 * and no effect — an editorial route ships none of its own JavaScript beyond the
 * framework's router.
 *
 * One thing worth writing down, because it looks like a hazard and is not: the game
 * writes a dread level onto the document element, and a client-side navigation does
 * not clear it. An editorial page reached from the ending of a lost game would
 * otherwise render at full corruption. The shell pins its own value locally instead —
 * see `.page` in `Editorial.module.css` — so these documents always look the same
 * however they were reached.
 *
 * The wordmark here is static. The animated, self-corrupting one belongs to the game.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site/config';
import styles from './Editorial.module.css';

/** Every editorial destination, in one place, so header and footer cannot disagree. */
export const EDITORIAL_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/darry', label: 'Darry' },
  { href: '/behind-the-game', label: 'Behind the game' },
  { href: '/faq', label: 'FAQ' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/privacy-choices', label: 'Privacy choices' },
  { href: '/terms', label: 'Terms' },
] as const;

/** The short set that sits in the masthead. The footer carries all of them. */
export const MASTHEAD_LINKS = ['/about', '/how-it-works', '/darry'] as const;

/**
 * The wordmark, drawn in text.
 *
 * `(ai)` carries the red exactly as it does in the game, and `aria-label` fixes the
 * accessible name to the whole word so it is never announced as three fragments.
 */
function MarkGlyphs() {
  return (
    <span aria-hidden="true">
      hum<span className={styles.markAi}>(ai)</span>n
    </span>
  );
}

export function Masthead({ current }: { current: string }) {
  return (
    <header className={styles.masthead}>
      <Link
        className={styles.mark}
        href="/"
        aria-label={`${SITE_NAME} — play`}
        data-testid="masthead-home"
      >
        <MarkGlyphs />
      </Link>

      <nav className={styles.mastheadNav} aria-label="Site">
        <Link
          className={`${styles.mastheadLink} ${styles.play}`}
          href="/"
          data-testid="masthead-play"
        >
          Play
        </Link>
        {EDITORIAL_LINKS.filter((link) =>
          (MASTHEAD_LINKS as readonly string[]).includes(link.href),
        ).map((link) => (
          <Link
            key={link.href}
            className={styles.mastheadLink}
            href={link.href}
            aria-current={link.href === current ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter({ current }: { current: string }) {
  return (
    <footer className={styles.footer} data-testid="site-footer">
      <nav className={styles.footerNav} aria-label="Site information">
        {EDITORIAL_LINKS.map((link) => (
          <Link
            key={link.href}
            className={styles.footerLink}
            href={link.href}
            aria-current={link.href === current ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <p className={styles.colophon}>
        hum(ai)n is an independent interactive horror experience. It is entertainment, not a
        psychological assessment.
      </p>
    </footer>
  );
}

/**
 * The scanline field and the vignette, without the noise layer.
 *
 * Two empty divs, so an editorial page inherits the game&rsquo;s screen texture at no
 * cost: no client component, no JavaScript, nothing animating. The noise layer is
 * deliberately left out — it drifts, and drift under body copy is unreadable.
 */
export function EditorialTexture() {
  return (
    <>
      <div className="crt-lines" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
    </>
  );
}

/** The shell every editorial route is wrapped in. */
export function EditorialShell({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <EditorialTexture />
      <div className={styles.inner}>
        <Masthead current={current} />
        {children}
        <SiteFooter current={current} />
      </div>
    </div>
  );
}
