import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { metadata as rootMetadata } from '@/app/layout';
import { GET as adsTxt } from '@/app/ads.txt/route';
import { adSlotId, adsEnabled, adsTxtBody, adsenseClientId } from '@/lib/ads/config';
import {
  ADSENSE_VERIFICATION_ID,
  ADSENSE_VERIFICATION_META_NAME,
} from '@/lib/ads/verification';

/**
 * AdSense site-ownership verification.
 *
 * Verification and serving are separate switches. The real ownership tag and ads.txt
 * record must stay present while the one permitted serving surface — editorial — stays
 * completely off until its real client and slot ids are configured.
 */
const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('the verification id', () => {
  it('is the account Google was given', () => {
    expect(ADSENSE_VERIFICATION_ID).toBe('ca-pub-5771510660460861');
  });

  it('has the shape of a real publisher id', () => {
    expect(ADSENSE_VERIFICATION_ID).toMatch(/^ca-pub-\d{16}$/);
  });

  it('uses the meta name Google looks for', () => {
    expect(ADSENSE_VERIFICATION_META_NAME).toBe('google-adsense-account');
  });
});

describe('the rendered metadata', () => {
  it('carries the verification tag', () => {
    expect(rootMetadata.other?.['google-adsense-account']).toBe('ca-pub-5771510660460861');
  });

  it('declares it through the metadata system, not a hand-written tag', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).not.toMatch(/<meta/);
    expect(layout).toContain('ADSENSE_VERIFICATION_META_NAME');
  });

  it('leaves the colour-scheme hint that was already there', () => {
    expect(rootMetadata.other?.['color-scheme']).toBe('dark');
  });

  it('leaves the publisher homepage indexable and canonical', () => {
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
    expect(rootMetadata.alternates?.canonical).toBe('/');
    expect(String(rootMetadata.metadataBase)).toBe('https://www.willyoubereplaced.com/');
    expect(rootMetadata.title).toBe('hum(ai)n — will you be replaced?');
    expect((rootMetadata.twitter as { card?: string } | undefined)?.card).toBe(
      'summary_large_image',
    );
  });
});

describe('verifying ownership does not start advertising', () => {
  it('leaves editorial advertising unconfigured', () => {
    expect(adsenseClientId()).toBeNull();
    expect(adSlotId('editorial')).toBeNull();
    expect(adsEnabled('editorial')).toBe(false);
  });

  it('publishes ads.txt for the verified account, which is not the same as serving', () => {
    expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
    expect(adsTxt().status).toBe(200);
  });

  it('loads no advertising script and enables no auto ads', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).not.toContain('googlesyndication');
    expect(layout).not.toContain('adsbygoogle');
    expect(layout).not.toContain('data-ad-client');
    expect(layout).not.toMatch(/<script/);
  });

  it('keeps the verification id out of the ad-serving configuration', () => {
    for (const file of [
      'src/lib/ads/config.ts',
      'src/components/ads/AdSlot.tsx',
      'src/app/ads.txt/route.ts',
      'next.config.ts',
      '.env.example',
    ]) {
      expect(readFileSync(file, 'utf8'), `${file}`).not.toContain(ADSENSE_VERIFICATION_ID);
    }
  });

  it('keeps the content security policy gated on the serving id', () => {
    const config = readFileSync('next.config.ts', 'utf8');
    expect(config).toMatch(/adsenseConfigured\s*=\s*Boolean\(\s*process\.env\.NEXT_PUBLIC_ADSENSE_CLIENT_ID/);
    expect(config).toContain("connect-src 'self'");
  });
});
