import { describe, expect, it } from 'vitest';
import PlayPage from '@/app/play/page';
import LinkedInPage, { metadata } from '@/app/linkedin/page';
import { metadata as rootMetadata } from '@/app/layout';

/**
 * `/linkedin` is a campaign entry into the game, not the publisher homepage.
 * It must resolve to the exact same component as `/play` while keeping its own URL.
 */
describe('/linkedin', () => {
  it('is the /play component, not a copy of it', () => {
    expect(LinkedInPage).toBe(PlayPage);
  });

  it('is a component rather than a redirect', () => {
    expect(typeof LinkedInPage).toBe('function');
  });

  it('renders the game, and nothing else', () => {
    const rendered = LinkedInPage() as { type: unknown; props: unknown };
    expect(rendered.type).toBeTypeOf('function');
    expect((rendered.type as { name?: string }).name).toBe('Game');
    expect(rendered.props).toEqual({});
  });
});

describe('/linkedin metadata', () => {
  it('names the public homepage as canonical, absolutely', () => {
    expect(metadata.alternates?.canonical).toBe('https://www.willyoubereplaced.com/');
    expect(String(metadata.alternates?.canonical)).toMatch(/^https:\/\//);
  });

  it('is noindex but still followed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('leaves the publisher homepage indexable', () => {
    expect(rootMetadata.robots).toEqual({ index: true, follow: true });
    expect((metadata.robots as { index?: boolean }).index).toBe(false);
  });

  it('changes nothing else about the campaign page metadata', () => {
    expect(Object.keys(metadata).sort()).toEqual(['alternates', 'robots']);
  });
});
