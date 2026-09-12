'use client';

/**
 * The site's single kind of advertising surface.
 *
 * Every ad goes through this component, and it starts from "no".
 *
 *  - With no publisher id and no editorial slot id it renders `null`: no element,
 *    reserved space, script tag, or network request.
 *  - In development only, `NEXT_PUBLIC_AD_PLACEHOLDERS=true` draws an empty labelled
 *    outline so article spacing can be judged without contacting Google.
 *  - Fully configured, it loads AdSense lazily from the article that contains it,
 *    never from the global layout.
 *
 * This component is permitted only after substantial editorial publisher content.
 * There is intentionally no advertising surface in the game, the ending, campaign
 * routes, the homepage, or legal/support pages. `tests/ads.test.tsx` guards that
 * boundary structurally.
 *
 * The label is real text, not decoration: an ad has to be identifiable as an ad.
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

  if (live && client && slot)
    return <LiveAd surface={surface} client={client} slot={slot} className={className} />;
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
    <aside
      className={`${styles.slot} ${className}`}
      aria-label="Advertisement"
      data-testid={`ad-${surface}`}
    >
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

/** Development-only labelled box; never contacts Google. */
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
