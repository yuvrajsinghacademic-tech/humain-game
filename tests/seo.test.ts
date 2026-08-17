import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { GET as adsTxt } from '@/app/ads.txt/route';
import { metadata as rootMetadata } from '@/app/layout';
import { EDITORIAL_LINKS } from '@/features/editorial/chrome';
import { campaignSlugs } from '@/lib/campaigns';
import { SITE_URL } from '@/lib/site/config';

/**
 * What a crawler sees.
 *
 * The load-bearing claim is the one about campaign addresses: nine URLs serve the
 * identical page, and if they competed for it in search the homepage would lose
 * ranking to its own marketing. So they are `noindex`, canonicalised to `/`, and
 * absent from the sitemap — but deliberately *not* disallowed in robots.txt, because
 * a path a crawler may not fetch is a path whose `noindex` is never read.
 */

describe('the sitemap', () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it('lists the game', () => {
    expect(urls).toContain(`${SITE_URL}/`);
  });

  it('lists every public document, and nothing else', () => {
    expect(urls.sort()).toEqual(
      [`${SITE_URL}/`, ...EDITORIAL_LINKS.map((link) => `${SITE_URL}${link.href}`)].sort(),
    );
  });

  it('excludes every campaign address', () => {
    for (const slug of campaignSlugs()) {
      expect(urls, `${slug} must not be in the sitemap`).not.toContain(`${SITE_URL}/${slug}`);
      expect(urls.some((url) => url.endsWith(`/${slug}`))).toBe(false);
    }
  });

  it('is absolute throughout', () => {
    for (const url of urls) expect(url).toMatch(/^https:\/\/www\.willyoubereplaced\.com/);
  });

  it('ranks the homepage above the documents', () => {
    const home = entries.find((entry) => entry.url === `${SITE_URL}/`);
    expect(home?.priority).toBe(1);
    for (const entry of entries.filter((candidate) => candidate.url !== `${SITE_URL}/`)) {
      expect(entry.priority ?? 0).toBeLessThan(1);
    }
  });

  it('is deterministic — the same file on every build', () => {
    // A build clock in `lastModified` restamps every page on every deploy, telling
    // crawlers content changed when it did not.
    expect(JSON.stringify(sitemap())).toBe(JSON.stringify(entries));
    for (const entry of entries) expect(entry.lastModified).toBe('2026-08-15');
  });
});

describe('robots.txt', () => {
  const rules = robots();

  it('does not block the site', () => {
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    expect(rule.userAgent).toBe('*');
    expect(rule.allow).toBe('/');
  });

  it('keeps crawlers out of the API, which returns no-store JSON', () => {
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    expect(rule.disallow).toBe('/api/');
  });

  it('lets campaign addresses be crawled, so their noindex is actually read', () => {
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    const disallowed = [rule.disallow ?? []].flat();
    for (const slug of campaignSlugs()) {
      expect(disallowed).not.toContain(`/${slug}`);
    }
  });

  it('points at the sitemap', () => {
    expect(rules.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe('the root metadata', () => {
  it('has an absolute base, so a relative canonical cannot resolve to localhost', () => {
    expect(String(rootMetadata.metadataBase)).toBe('https://www.willyoubereplaced.com/');
  });

  it('canonicalises the homepage to itself', () => {
    expect(rootMetadata.alternates?.canonical).toBe('/');
  });

  it('carries a social preview for the share loop', () => {
    expect(rootMetadata.openGraph?.title).toBeTruthy();
    expect(String(rootMetadata.openGraph?.description).length).toBeGreaterThan(40);
    expect((rootMetadata.twitter as { card?: string } | undefined)?.card).toBe('summary_large_image');
  });

  it('stays indexable', () => {
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
  });
});

describe('/ads.txt', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  beforeEach(() => delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID);
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    else process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = ORIGINAL;
  });

  it('is absent while no publisher account is configured', async () => {
    const response = adsTxt();
    expect(response.status).toBe(404);
    // Not an empty 200 and not a fabricated record: the file simply does not exist.
    expect(await response.text()).not.toMatch(/pub-/);
  });

  it('serves the real record once a publisher id is set', async () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'ca-pub-1234567890123456';
    const response = adsTxt();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe(
      'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n',
    );
  });

  it('stays absent for a malformed publisher id', async () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'YOUR_PUBLISHER_ID';
    expect(adsTxt().status).toBe(404);
  });
});
