'use client';

/**
 * One advertising surface.
 *
 * Every ad on this site goes through this component, and it starts from "no".
 *
 *  - With no publisher id **and** no slot id for this surface it renders `null` —
 *    no element, no reserved space, no script tag, no network request.
 *  - In development, and only when `NEXT_PUBLIC_AD_PLACEHOLDERS=true`, it draws an
 *    empty labelled outline so the spacing around an ad can be judged. It still
 *    loads nothing and contacts nobody.
 *  - Fully configured, it loads the AdSense library **lazily, from here** rather
 *    than from a layout — so the script exists only on a page that is actually
 *    showing an ad, and never during the game.
 *
 * Where this may be used is a product decision, not a technical one, and it is
 * written down in one place: `docs/MONETIZATION.md`. In short — editorial pages,
 * below the article; and the post-game area, well below the reveal. Never on boot,
 * the menu, the warning, the assessment, the booth, a round transition, or the
 * ending reveal itself. `tests/ads.test.tsx` asserts the second list.
 *
 * The label is real text, not a decoration: an ad has to be identifiable as an ad.
 */

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import {
  ADSENSE_SCRIPT_SRC,
  adPlaceholdersEnabled,
  adSlotId,
  adsEnabled,
  adsenseClientId,
  type AdSurface,
} from '@/lib/ads/config';
import styles from './AdSlot.module.css';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({ surface, className = '' }: { surface: AdSurface; className?: string }) {
  const client = adsenseClientId();
  const slot = adSlotId(surface);
  const live = adsEnabled(surface);
  const placeholder = !live && adPlaceholdersEnabled();

  if (live && client && slot) return <LiveAd surface={surface} client={client} slot={slot} className={className} />;
  if (placeholder) return <PlaceholderAd surface={surface} className={className} />;
  return null;
}

/** The configured unit. Only ever reached when both ids are present and well-formed. */
function LiveAd({
  surface,
  client,
  slot,
  className,
}: {
  surface: AdSurface;
  client: string;
  slot: string;
  className: string;
}) {
  const ins = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // One push per rendered unit. Strict mode double-invokes effects, and a second
    // push against the same element is what produces AdSense's "already have ads in
    // them" console error.
    if (!ready || pushed.current || !ins.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      /* a refused or blocked ad is not an error the page should react to */
    }
  }, [ready]);

  return (
    <aside className={`${styles.slot} ${className}`} aria-label="Advertisement" data-testid={`ad-${surface}`}>
      <p className={styles.label}>ADVERTISEMENT</p>
      <div className={styles.frame}>
        <ins
          ref={ins}
          className={`adsbygoogle ${styles.unit}`}
          style={{ display: 'block' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
      {/*
        `afterInteractive` rather than `beforeInteractive`: nothing on this page waits
        for an advertisement. The id is fixed so several units on one page share a
        single library load.
      */}
      <Script
        id="adsbygoogle-init"
        src={`${ADSENSE_SCRIPT_SRC}?client=${encodeURIComponent(client)}`}
        strategy="afterInteractive"
        crossOrigin="anonymous"
        onReady={() => setReady(true)}
      />
    </aside>
  );
}

/**
 * A box, and nothing more.
 *
 * Development only. It exists so a layout can be judged with the space taken, and it
 * says what it is so nobody mistakes it for a working integration.
 */
function PlaceholderAd({ surface, className }: { surface: AdSurface; className: string }) {
  return (
    <aside
      className={`${styles.slot} ${className}`}
      aria-label="Advertisement placeholder"
      data-testid={`ad-placeholder-${surface}`}
    >
      <p className={styles.label}>ADVERTISEMENT</p>
      <div className={`${styles.frame} ${styles.empty}`}>
        <span className={styles.emptyNote}>ad surface — {surface} — not configured</span>
      </div>
    </aside>
  );
}
