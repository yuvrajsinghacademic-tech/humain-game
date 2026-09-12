import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdSlot } from '@/components/ads/AdSlot';
import { adSlotId, adsEnabled, adsTxtBody, adsenseClientId } from '@/lib/ads/config';
import { ADSENSE_VERIFICATION_ID } from '@/lib/ads/verification';

/**
 * AdSense is allowed beside substantial publisher content only.
 *
 * The game, its ending, campaign routes, the homepage and legal/support pages have no
 * advertising surface. This file checks both halves: the editorial unit behaves when
 * configured, and source structure prevents it from leaking into disallowed screens.
 */
const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL;
  delete process.env.NEXT_PUBLIC_AD_PLACEHOLDERS;
});

afterEach(() => {
  cleanup();
  process.env = { ...ORIGINAL };
});

describe('with serving unconfigured', () => {
  it('renders absolutely nothing', () => {
    const { container } = render(<AdSlot surface="editorial" />);
    expect(container.innerHTML).toBe('');
  });

  it('loads no Google ad script', () => {
    render(<AdSlot surface="editorial" />);
    expect(document.querySelectorAll('script[src*="googlesyndication"]')).toHaveLength(0);
  });

  it('reports no client and no slot', () => {
    expect(adsenseClientId()).toBeNull();
    expect(adSlotId('editorial')).toBeNull();
    expect(adsEnabled('editorial')).toBe(false);
  });

  it('still publishes ads.txt because seller verification is not ad serving', () => {
    expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
  });
});

describe('configuration validation', () => {
  it('stays off when only the publisher id is present', () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'ca-pub-1234567890123456';
    expect(adsEnabled('editorial')).toBe(false);
  });

  it('stays off when only the editorial slot is present', () => {
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL = '1234567890';
    expect(adsEnabled('editorial')).toBe(false);
  });

  it('refuses malformed ids rather than loading a broken tag', () => {
    for (const bad of ['pub-1234567890123456', 'ca-pub-abc', 'ca-pub-', 'YOUR_ID_HERE', ' ']) {
      process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = bad;
      expect(adsenseClientId(), bad).toBeNull();
    }

    for (const bad of ['slot-1', 'abcdef', '123', '']) {
      process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL = bad;
      expect(adSlotId('editorial'), bad).toBeNull();
    }
  });
});

describe('with a fully configured editorial unit', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'ca-pub-1234567890123456';
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL = '9876543210';
  });

  it('renders a labelled accessible unit with the configured ids', () => {
    render(<AdSlot surface="editorial" />);
    const slot = screen.getByTestId('ad-editorial');
    expect(slot).toHaveAccessibleName('Advertisement');
    expect(slot).toHaveTextContent('ADVERTISEMENT');

    const unit = document.querySelector('ins.adsbygoogle');
    expect(unit).toHaveAttribute('data-ad-client', 'ca-pub-1234567890123456');
    expect(unit).toHaveAttribute('data-ad-slot', '9876543210');
    expect(unit).toHaveAttribute('data-full-width-responsive', 'true');
  });
});

describe('development placeholder', () => {
  it('is opt-in and never loads an ad script', () => {
    process.env.NEXT_PUBLIC_AD_PLACEHOLDERS = 'true';
    const { container } = render(<AdSlot surface="editorial" />);
    expect(screen.getByTestId('ad-placeholder-editorial')).toBeInTheDocument();
    expect(container.querySelectorAll('ins.adsbygoogle')).toHaveLength(0);
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('is suppressed in production', () => {
    process.env.NEXT_PUBLIC_AD_PLACEHOLDERS = 'true';
    const previous = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
      const { container } = render(<AdSlot surface="editorial" />);
      expect(container.innerHTML).toBe('');
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: previous, configurable: true });
    }
  });
});

describe('placement policy', () => {
  const ALLOWED_IMPORTERS = ['src/features/editorial/page.tsx'];
  const DISALLOWED = [
    'src/features/ending/Ending.tsx',
    'src/features/game/Game.tsx',
    'src/features/game/Boot.tsx',
    'src/features/game/Menu.tsx',
    'src/features/game/Consent.tsx',
    'src/features/game/ChoiceScreen.tsx',
    'src/features/game/ResultsTesting.tsx',
    'src/features/game/Settings.tsx',
    'src/features/game/About.tsx',
    'src/features/game/Modal.tsx',
    'src/features/calibration/AssessmentScreen.tsx',
    'src/features/calibration/QuestionView.tsx',
    'src/features/prediction/Booth.tsx',
    'src/components/Screen.tsx',
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'src/app/play/page.tsx',
    'src/app/[campaign]/page.tsx',
    'src/app/linkedin/page.tsx',
  ];

  it('has exactly one source-level importer: the editorial page shell', () => {
    for (const file of ALLOWED_IMPORTERS) {
      expect(readFileSync(file, 'utf8'), `${file} should render an editorial ad surface`).toContain(
        'AdSlot',
      );
    }
  });

  it('never reaches the homepage, game, ending, or campaign routes', () => {
    for (const file of DISALLOWED) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not render advertising`).not.toContain('AdSlot');
      expect(source, `${file} must not load an ad script`).not.toContain('adsbygoogle');
    }
  });

  it('is never loaded globally', () => {
    expect(readFileSync('src/app/layout.tsx', 'utf8')).not.toContain('googlesyndication');
  });

  it('has no post-game serving variable left in shipped configuration', () => {
    for (const file of ['.env.example', 'src/lib/ads/config.ts']) {
      expect(readFileSync(file, 'utf8')).not.toContain('ADSENSE_SLOT_POSTGAME');
      expect(readFileSync(file, 'utf8')).not.toContain('postgame');
    }
  });
});

describe('ads.txt', () => {
  it('is the verified account with Google’s certification id', () => {
    expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
    expect(adsTxtBody()).toContain(ADSENSE_VERIFICATION_ID.replace(/^ca-/, ''));
    expect(adsTxtBody()).not.toContain(ADSENSE_VERIFICATION_ID);
  });

  it('does not follow the ad-serving switch', () => {
    for (const value of [undefined, 'ca-pub-1234567890123456', 'YOUR_PUBLISHER_ID']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
      else process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = value;
      expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
    }
  });
});
