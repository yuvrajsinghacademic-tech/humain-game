import { describe, expect, it } from 'vitest';
import PlayPage from '@/app/play/page';
import CampaignPage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from '@/app/[campaign]/page';
import LinkedInPage, { metadata as linkedInMetadata } from '@/app/linkedin/page';
import { metadata as rootMetadata } from '@/app/layout';
import {
  CAMPAIGNS,
  SLUG_PATTERN,
  campaignMetadata,
  campaignSlugs,
  campaignUrl,
  findCampaign,
  isCampaignSlug,
  sharedCampaignSlugs,
} from '@/lib/campaigns';
import { SITE_URL } from '@/lib/site/config';

/**
 * The campaign engine.
 *
 * A campaign route is a physical marketing claim: a sticker on a wall points at one of
 * these addresses and cannot be edited afterwards. So the properties asserted here are
 * the ones whose failure would be expensive rather than merely wrong — a slug that
 * cannot be typed, an address that 404s, a route that is not the game, or a campaign
 * URL quietly competing with the publisher homepage in search.
 */
describe('the campaign registry', () => {
  it('has a printable, route-safe slug for every campaign', () => {
    for (const campaign of CAMPAIGNS) {
      expect(campaign.slug, `${campaign.slug} must be lowercase a-z0-9 with single hyphens`).toMatch(
        SLUG_PATTERN,
      );
      expect(campaign.slug.length).toBeLessThanOrEqual(20);
    }
  });

  it('has no duplicate slugs', () => {
    const slugs = campaignSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('records a placement for every campaign, so a report can be read months later', () => {
    for (const campaign of CAMPAIGNS) {
      expect(campaign.placement.length, `${campaign.slug} has no placement`).toBeGreaterThan(0);
    }
  });

  it('splits the Sunset A/B pair into two addresses', () => {
    const a = findCampaign('sunset-a');
    const b = findCampaign('sunset-b');
    expect(a?.placement).toBe(b?.placement);
    expect(a?.creative).not.toBe(b?.creative);
    expect(a?.creative).toBeTruthy();
    expect(b?.creative).toBeTruthy();
  });

  it('keeps the two Handshake addresses separate rather than pairing them', () => {
    const resume = findCampaign('handshake-resume');
    const ai = findCampaign('handshake-ai');
    expect(resume?.channel).toBe('social');
    expect(ai?.channel).toBe('social');
    expect(resume?.placement).not.toBe(ai?.placement);
    expect(resume?.creative).toBeUndefined();
    expect(ai?.creative).toBeUndefined();
  });

  it('serves both Handshake addresses from the shared route, with no file of their own', () => {
    for (const slug of ['handshake-resume', 'handshake-ai']) {
      expect(findCampaign(slug)?.ownRoute, `${slug} must not claim its own file`).toBeUndefined();
      expect(sharedCampaignSlugs()).toContain(slug);
    }
  });

  it('contains every address that has been announced', () => {
    for (const slug of [
      'linkedin',
      'sunset-a',
      'sunset-b',
      'melrose',
      'dtla',
      'venice',
      'silverlake',
      'usc',
      'unlv',
      'handshake-resume',
      'handshake-ai',
    ]) {
      expect(isCampaignSlug(slug), `${slug} is missing from CAMPAIGNS`).toBe(true);
    }
  });

  it('rejects anything not registered', () => {
    for (const slug of ['fairfax-a', 'about', 'privacy', '', 'SUNSET-A', 'handshake']) {
      expect(isCampaignSlug(slug)).toBe(false);
    }
  });

  it('builds the exact URL a QR code must encode', () => {
    expect(campaignUrl('sunset-a')).toBe('https://www.willyoubereplaced.com/sunset-a');
    expect(campaignUrl('usc')).toBe(`${SITE_URL}/usc`);
    expect(campaignUrl('handshake-resume')).toBe(`${SITE_URL}/handshake-resume`);
  });
});

describe('the shared [campaign] route', () => {
  it('is the /play component, not a copy of it', () => {
    expect(CampaignPage).toBe(PlayPage);
  });

  it('is the same component /linkedin serves', () => {
    expect(CampaignPage).toBe(LinkedInPage);
  });

  it('generates one static path per shared campaign', () => {
    const params = generateStaticParams();
    expect(params.map((entry) => entry.campaign).sort()).toEqual(sharedCampaignSlugs().sort());
  });

  it('leaves /linkedin to its own route file', () => {
    expect(sharedCampaignSlugs()).not.toContain('linkedin');
    expect(campaignSlugs()).toContain('linkedin');
  });

  it('serves nothing that is not registered', () => {
    expect(dynamicParams).toBe(false);
  });

  it('canonicalises each campaign to the publisher homepage and keeps it out of the index', async () => {
    for (const slug of sharedCampaignSlugs()) {
      const metadata = await generateMetadata({ params: Promise.resolve({ campaign: slug }) });
      expect(metadata.alternates?.canonical, `${slug} canonical`).toBe(
        'https://www.willyoubereplaced.com/',
      );
      expect(metadata.robots, `${slug} robots`).toEqual({ index: false, follow: true });
    }
  });
});

describe('campaign metadata', () => {
  it('is exactly two fields, so everything else is inherited from the layout', () => {
    expect(Object.keys(campaignMetadata('melrose')).sort()).toEqual(['alternates', 'robots']);
  });

  it('is absolute, so it cannot resolve against localhost during a build', () => {
    expect(String(campaignMetadata('dtla').alternates?.canonical)).toMatch(/^https:\/\//);
  });

  it('refuses a slug with no row in the registry', () => {
    expect(() => campaignMetadata('fairfax-a')).toThrow(/CAMPAIGNS/);
  });

  it('leaves the publisher homepage indexable', () => {
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
  });
});

describe('/linkedin', () => {
  it('names the publisher homepage as canonical, absolutely', () => {
    expect(linkedInMetadata.alternates?.canonical).toBe('https://www.willyoubereplaced.com/');
  });

  it('is noindex but still followed', () => {
    expect(linkedInMetadata.robots).toEqual({ index: false, follow: true });
  });
});
