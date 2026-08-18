import { describe, expect, it } from 'vitest';
import RootPage from '@/app/page';
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
 * URL quietly competing with the homepage in search.
 */

describe('the campaign registry', () => {
  it('has a printable, route-safe slug for every campaign', () => {
    for (const campaign of CAMPAIGNS) {
      expect(campaign.slug, `${campaign.slug} must be lowercase a-z0-9 with single hyphens`).toMatch(
        SLUG_PATTERN,
      );
      // Long enough to be meaningful, short enough to sit under a QR code.
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
    // Two creatives on one street can only be told apart by the URL they point at;
    // there is no other signal, so a shared slug would silently lose the experiment.
    const a = findCampaign('sunset-a');
    const b = findCampaign('sunset-b');
    expect(a?.placement).toBe(b?.placement);
    expect(a?.creative).not.toBe(b?.creative);
    expect(a?.creative).toBeTruthy();
    expect(b?.creative).toBeTruthy();
  });

  it('keeps the two Handshake addresses separate rather than pairing them', () => {
    // Deliberately not the Sunset arrangement: these are two placements that happen to
    // share a prefix, not two creatives at one placement. Asserted so that a later
    // reader does not "fix" them into an A/B pair and silently merge the comparison.
    const resume = findCampaign('handshake-resume');
    const ai = findCampaign('handshake-ai');
    expect(resume?.channel).toBe('social');
    expect(ai?.channel).toBe('social');
    expect(resume?.placement).not.toBe(ai?.placement);
    expect(resume?.creative).toBeUndefined();
    expect(ai?.creative).toBeUndefined();
  });

  it('serves both Handshake addresses from the shared route, with no file of their own', () => {
    // Only /linkedin predates the shared route, so nothing new should ever be ownRoute.
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
  it('is the root page component, not a copy of it', () => {
    // Component identity rather than rendered output: two implementations that agree
    // today would pass a markup comparison and drift tomorrow.
    expect(CampaignPage).toBe(RootPage);
  });

  it('is the same component /linkedin serves', () => {
    expect(CampaignPage).toBe(LinkedInPage);
  });

  it('generates one static path per shared campaign', async () => {
    const params = generateStaticParams();
    expect(params.map((entry) => entry.campaign).sort()).toEqual(sharedCampaignSlugs().sort());
  });

  it('leaves /linkedin to its own route file', () => {
    // Both claiming one path is the kind of ambiguity that resolves differently in
    // development and production.
    expect(sharedCampaignSlugs()).not.toContain('linkedin');
    expect(campaignSlugs()).toContain('linkedin');
  });

  it('serves nothing that is not registered', () => {
    // With `dynamicParams` false, a slug outside generateStaticParams is a 404 — so
    // this route is not a catch-all that swallows typos and dead links.
    expect(dynamicParams).toBe(false);
  });

  it('canonicalises each campaign to the homepage and keeps it out of the index', async () => {
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
    // Title, description, icon and social preview must come from the root layout, or a
    // campaign URL would present differently from the homepage it is a copy of.
    expect(Object.keys(campaignMetadata('melrose')).sort()).toEqual(['alternates', 'robots']);
  });

  it('is absolute, so it cannot resolve against localhost during a build', () => {
    expect(String(campaignMetadata('dtla').alternates?.canonical)).toMatch(/^https:\/\//);
  });

  it('refuses a slug with no row in the registry', () => {
    // A live address nobody has written down would be invisible to the QR generator,
    // the documentation and these tests.
    expect(() => campaignMetadata('fairfax-a')).toThrow(/CAMPAIGNS/);
  });

  it('leaves the homepage indexable', () => {
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
  });
});

/**
 * The original campaign route, kept because its address is already in circulation.
 * These assertions were written before the shared route existed and are unchanged.
 */
describe('/linkedin', () => {
  it('names the homepage as canonical, absolutely', () => {
    expect(linkedInMetadata.alternates?.canonical).toBe('https://www.willyoubereplaced.com/');
  });

  it('is noindex but still followed', () => {
    expect(linkedInMetadata.robots).toEqual({ index: false, follow: true });
  });
});
