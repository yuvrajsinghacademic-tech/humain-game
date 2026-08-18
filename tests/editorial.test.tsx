import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page';
import HowItWorksPage, { metadata as howMetadata } from '@/app/how-it-works/page';
import DarryPage, { metadata as darryMetadata } from '@/app/darry/page';
import BehindPage, { metadata as behindMetadata } from '@/app/behind-the-game/page';
import FaqPage, { metadata as faqMetadata } from '@/app/faq/page';
import PrivacyPage, { metadata as privacyMetadata } from '@/app/privacy/page';
import PrivacyChoicesPage, { metadata as choicesMetadata } from '@/app/privacy-choices/page';
import TermsPage, { metadata as termsMetadata } from '@/app/terms/page';
import { EDITORIAL_LINKS } from '@/features/editorial/chrome';
import { LEGAL_LAST_UPDATED } from '@/lib/site/config';

/**
 * The editorial layer.
 *
 * Two different jobs are being checked. The first is ordinary: these pages have to
 * render, carry metadata, and link to each other correctly, because a monetisation
 * review will click every one of them.
 *
 * The second matters more. These pages are the only place the project makes claims
 * about itself in public, so the assertions below are about *substance*: that each
 * page carries real writing rather than a placeholder, that the legal documents say
 * the specific things the implementation actually does, and — critically — that they
 * never make the sweeping "we collect nothing" claim that the code would not support.
 */

const PAGES = [
  { path: '/about', Page: AboutPage, metadata: aboutMetadata, file: 'File 01' },
  { path: '/how-it-works', Page: HowItWorksPage, metadata: howMetadata, file: 'File 02' },
  { path: '/darry', Page: DarryPage, metadata: darryMetadata, file: 'File 03' },
  { path: '/behind-the-game', Page: BehindPage, metadata: behindMetadata, file: 'File 04' },
  { path: '/faq', Page: FaqPage, metadata: faqMetadata, file: 'File 05' },
  { path: '/privacy', Page: PrivacyPage, metadata: privacyMetadata, file: 'File 06' },
  { path: '/privacy-choices', Page: PrivacyChoicesPage, metadata: choicesMetadata, file: 'File 07' },
  { path: '/terms', Page: TermsPage, metadata: termsMetadata, file: 'File 08' },
] as const;

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe.each(PAGES)('$path', ({ Page, metadata, file, path }) => {
  it('renders', () => {
    render(<Page />);
    expect(screen.getByTestId('editorial-article')).toBeInTheDocument();
  });

  it('has exactly one level-one heading', () => {
    render(<Page />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('carries its own file number', () => {
    render(<Page />);
    expect(bodyText()).toContain(file);
  });

  it('has a title, a description and a canonical of its own', () => {
    expect(metadata.title).toBeTruthy();
    expect(String(metadata.title)).toContain('hum(ai)n');
    expect(String(metadata.description).length).toBeGreaterThan(60);
    expect(metadata.alternates?.canonical).toBe(`https://www.willyoubereplaced.com${path}`);
  });

  it('is indexable — it does not inherit a campaign route’s noindex', () => {
    expect(metadata.robots).toBeUndefined();
  });

  it('carries a social preview', () => {
    expect(metadata.openGraph?.title).toBeTruthy();
    expect((metadata.twitter as { card?: string } | undefined)?.card).toBe('summary_large_image');
  });

  it('contains real writing rather than a placeholder', () => {
    render(<Page />);
    const text = bodyText();
    // A monetisation review rejects thin pages. The shortest of these is the Darry
    // file, which is deliberately atmospheric and still well past this bar.
    expect(text.length).toBeGreaterThan(1800);
    expect(text.toLowerCase()).not.toContain('lorem ipsum');
    expect(text.toLowerCase()).not.toContain('coming soon');
    expect(text.toLowerCase()).not.toContain('todo');
  });

  it('offers the whole site from its footer', () => {
    render(<Page />);
    const footer = within(screen.getByTestId('site-footer'));
    for (const link of EDITORIAL_LINKS) {
      expect(footer.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
    }
  });

  it('offers a way back into the game', () => {
    render(<Page />);
    expect(screen.getByTestId('masthead-play')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('masthead-home')).toHaveAttribute('href', '/');
  });

  it('marks itself as the current page for assistive technology', () => {
    render(<Page />);
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBeGreaterThan(0);
    for (const node of current) expect(node.getAttribute('href')).toBe(path);
  });
});

describe('the legal documents', () => {
  it('are dated', () => {
    for (const Page of [PrivacyPage, PrivacyChoicesPage, TermsPage]) {
      const { unmount } = render(<Page />);
      expect(screen.getByTestId('last-updated')).toHaveTextContent(LEGAL_LAST_UPDATED);
      unmount();
    }
  });

  it('do not carry advertising', () => {
    // An ad next to a privacy policy is bad manners, and on some readings worse.
    for (const Page of [PrivacyPage, PrivacyChoicesPage, TermsPage]) {
      const { unmount } = render(<Page />);
      expect(screen.queryByTestId('ad-editorial')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ad-placeholder-editorial')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('state honestly that no contact address is published while none is configured', () => {
    render(<PrivacyPage />);
    // Rather than inventing a mailbox that would bounce.
    expect(screen.getByTestId('contact-line')).toHaveTextContent(/has not been published/i);
  });
});

describe('the privacy policy', () => {
  it('describes what is actually stored, rather than claiming nothing is', () => {
    render(<PrivacyPage />);
    const text = bodyText();

    // Every one of these is a real property of the implementation.
    expect(text).toContain('hg_sid');
    expect(text).toMatch(/local storage/i);
    expect(text).toMatch(/twelve hours/i);
    expect(text).toMatch(/HTTP-only/i);
    expect(text).toMatch(/Vercel/);
    expect(text).toMatch(/OpenAI/);
    expect(text).toMatch(/Upstash/);
    expect(text).toMatch(/rate.limit/i);
  });

  it('never makes a claim the code would contradict', () => {
    render(<PrivacyPage />);
    const text = bodyText().toLowerCase();

    // The four sweeping statements that are simply untrue of this application: it does
    // set a cookie, it does process a network address to rate-limit, and it does store
    // one preference on the device.
    expect(text).not.toContain('we collect no data');
    expect(text).not.toContain('we use no cookies');
    expect(text).not.toContain('no cookies are used');
    expect(text).not.toContain('we store absolutely nothing');
    expect(text).not.toContain('we never process ip');
    expect(text).not.toContain('never see your ip');
  });

  it('is honest that advertising is not running yet', () => {
    render(<PrivacyPage />);
    expect(bodyText()).toMatch(/No advertising is running on this site at present/i);
  });

  it('separates the four kinds of data rather than blurring them', () => {
    render(<PrivacyPage />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Temporary gameplay state');
    expect(headings).toContain('Stored on your device');
    expect(headings).toContain('Abuse and cost limits');
    expect(headings).toContain('Advertising');
  });
});

describe('the terms', () => {
  it('invent no company, address or jurisdiction', () => {
    render(<TermsPage />);
    const text = bodyText();
    expect(text).not.toMatch(/\bLLC\b|\bInc\.|\bLtd\b|\bGmbH\b/);
    expect(text).not.toMatch(/governed by the laws of/i);
    expect(text).not.toMatch(/registered (office|address)/i);
    // No street address, no postcode, no invented company number.
    expect(text).not.toMatch(/\b\d{5}(-\d{4})?\b/);
  });

  it('carry the warning and the not-advice statement', () => {
    render(<TermsPage />);
    const text = bodyText();
    expect(text).toMatch(/psychological horror/i);
    expect(text).toMatch(/not .{0,40}(medical|psychological)/i);
    expect(text).toMatch(/limitation|liable/i);
  });

  it('keep the limitation of liability within what law allows', () => {
    render(<TermsPage />);
    // A blanket exclusion is unenforceable in most places and reads as boilerplate
    // written by nobody. This one says so itself.
    expect(bodyText()).toMatch(/cannot lawfully be limited/i);
  });
});

describe('privacy choices', () => {
  it('does not pretend a consent manager exists', () => {
    render(<PrivacyChoicesPage />);
    expect(screen.getByTestId('consent-control-absent')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-control')).not.toBeInTheDocument();
  });

  it('lists the controls that genuinely do exist today', () => {
    render(<PrivacyChoicesPage />);
    const text = bodyText();
    expect(text).toMatch(/reduce-motion/i);
    expect(text).toMatch(/Settings/);
    expect(text).toMatch(/Clear this site/i);
  });
});
