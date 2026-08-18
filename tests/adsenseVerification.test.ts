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
 * Two claims, and the second is the one worth having. The first is that the tag is
 * present and names the right account, because a truncated paste fails Google's fetch
 * silently and the symptom is an account that simply never verifies. The second is that
 * naming the account changed nothing else that matters: no script, no ad unit, no widened
 * policy. (ads.txt does publish, deliberately — it names the authorised owner rather than
 * switching serving on.) Verification and monetisation are separate switches, and this asserts that the
 * first one being on leaves the second one off.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  // The shipped state: no ad-serving variable is configured.
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('the verification id', () => {
  it('is the account Google was given', () => {
    expect(ADSENSE_VERIFICATION_ID).toBe('ca-pub-5771510660460861');
  });

  it('has the shape of a real publisher id', () => {
    // `ca-pub-` and sixteen digits. Checked rather than trusted: a value one digit short
    // is indistinguishable by eye and fails only at Google's end, days later.
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
    // If this ever moves into raw JSX the tag stops being deduplicated by the framework
    // and starts being duplicated per-route.
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).not.toMatch(/<meta/);
    expect(layout).toContain('ADSENSE_VERIFICATION_META_NAME');
  });

  it('leaves the colour-scheme hint that was already there', () => {
    // `other` is a single object; adding a key to it must not displace the existing one.
    expect(rootMetadata.other?.['color-scheme']).toBe('dark');
  });

  it('changes nothing else about what a crawler sees', () => {
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
  it('leaves advertising unconfigured', () => {
    // The verification id lives in its own module precisely so that it cannot be read
    // as ad-serving configuration. This is that separation, asserted.
    expect(adsenseClientId()).toBeNull();
    expect(adSlotId('editorial')).toBeNull();
    expect(adSlotId('postgame')).toBeNull();
    expect(adsEnabled('editorial')).toBe(false);
    expect(adsEnabled('postgame')).toBe(false);
  });

  it('publishes ads.txt for the verified account, which is not the same as serving', () => {
    // ads.txt declares who may sell this inventory. That is an ownership claim, true
    // from verification onwards, and Google's site review reads it before any ad runs.
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
    // The `no fabricated credentials` guard in ads.test.tsx owns those five files. This
    // asserts the boundary from the other side: the real id has not leaked into them.
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

  it('leaves the content security policy free of advertising hosts', () => {
    // The policy is gated on NEXT_PUBLIC_ADSENSE_CLIENT_ID, which this change does not
    // set, so the emitted policy is still the ad-free one.
    const config = readFileSync('next.config.ts', 'utf8');
    expect(config).toMatch(/adsenseConfigured\s*=\s*Boolean\(\s*process\.env\.NEXT_PUBLIC_ADSENSE_CLIENT_ID/);
    expect(config).toContain("connect-src 'self'");
  });
});
