import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdSlot } from '@/components/ads/AdSlot';
import { adSlotId, adsEnabled, adsTxtBody, adsenseClientId } from '@/lib/ads/config';
import { ADSENSE_VERIFICATION_ID } from '@/lib/ads/verification';

/**
 * Advertising.
 *
 * Three separate claims, and the order matters.
 *
 *  1. **Nothing is configured, so nothing renders.** This is the state the repository
 *     is in and the state a reviewer will see: no element, no reserved space, no
 *     script tag, no request to Google.
 *  2. **No credential is invented anywhere.** A plausible-looking publisher id in the
 *     source would either be noise or would authorise a stranger's account.
 *  3. **Ads cannot appear inside the game.** Asserted structurally — by which modules
 *     are allowed to import the component at all — rather than by rendering every
 *     screen and hoping the list was complete.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME;
  delete process.env.NEXT_PUBLIC_AD_PLACEHOLDERS;
});

afterEach(() => {
  cleanup();
  process.env = { ...ORIGINAL };
});

describe('with nothing configured', () => {
  it('renders absolutely nothing', () => {
    const { container } = render(<AdSlot surface="editorial" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for the post-game surface either', () => {
    const { container } = render(<AdSlot surface="postgame" />);
    expect(container.innerHTML).toBe('');
  });

  it('does not crash, and adds no script tag', () => {
    render(<AdSlot surface="editorial" />);
    expect(document.querySelectorAll('script[src*="googlesyndication"]')).toHaveLength(0);
  });

  it('reports no client and no slots', () => {
    expect(adsenseClientId()).toBeNull();
    expect(adSlotId('editorial')).toBeNull();
    expect(adSlotId('postgame')).toBeNull();
    expect(adsEnabled('editorial')).toBe(false);
    expect(adsEnabled('postgame')).toBe(false);
  });

  it('still publishes ads.txt, because that names the owner rather than running ads', () => {
    // ads.txt follows the verified account, not the serving switch: it says which
    // account may sell this inventory, which is true before anything is served.
    expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
  });
});

describe('with a half-configured account', () => {
  it('stays off when only the publisher id is present', () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'ca-pub-1234567890123456';
    expect(adsEnabled('editorial')).toBe(false);
    const { container } = render(<AdSlot surface="editorial" />);
    expect(container.innerHTML).toBe('');
  });

  it('stays off when only a slot is present', () => {
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL = '1234567890';
    expect(adsEnabled('editorial')).toBe(false);
  });

  it('refuses a malformed publisher id rather than shipping a broken tag', () => {
    for (const bad of ['pub-1234567890123456', 'ca-pub-abc', 'ca-pub-', 'YOUR_ID_HERE', ' ']) {
      process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = bad;
      expect(adsenseClientId(), bad).toBeNull();
    }
  });

  it('refuses a malformed slot id', () => {
    for (const bad of ['slot-1', 'abcdef', '123', '']) {
      process.env.NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME = bad;
      expect(adSlotId('postgame'), bad).toBeNull();
    }
  });
});

describe('with a fully configured account', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = 'ca-pub-1234567890123456';
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL = '9876543210';
  });

  it('renders a labelled, accessible unit', () => {
    render(<AdSlot surface="editorial" />);
    const slot = screen.getByTestId('ad-editorial');
    expect(slot).toHaveAccessibleName('Advertisement');
    // An ad has to be identifiable as an ad, in text a person can read.
    expect(slot).toHaveTextContent('ADVERTISEMENT');
  });

  it('passes the configured ids to the unit and invents nothing', () => {
    render(<AdSlot surface="editorial" />);
    const unit = document.querySelector('ins.adsbygoogle');
    expect(unit).toHaveAttribute('data-ad-client', 'ca-pub-1234567890123456');
    expect(unit).toHaveAttribute('data-ad-slot', '9876543210');
    expect(unit).toHaveAttribute('data-full-width-responsive', 'true');
  });

  it('leaves a surface whose slot was never created switched off', () => {
    const { container } = render(<AdSlot surface="postgame" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the development placeholder', () => {
  it('is off unless explicitly asked for', () => {
    const { container } = render(<AdSlot surface="postgame" />);
    expect(container.innerHTML).toBe('');
  });

  it('draws an empty box, and still loads nothing, when switched on', () => {
    process.env.NEXT_PUBLIC_AD_PLACEHOLDERS = 'true';
    const { container } = render(<AdSlot surface="postgame" />);
    expect(screen.getByTestId('ad-placeholder-postgame')).toBeInTheDocument();
    // Scoped to what this render produced: the framework's script loader appends to
    // the document head and does not clean up between tests, so a document-wide query
    // here would be reporting on the previous block rather than on this one.
    expect(container.querySelectorAll('ins.adsbygoogle')).toHaveLength(0);
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('never appears in a production build', () => {
    process.env.NEXT_PUBLIC_AD_PLACEHOLDERS = 'true';
    const previous = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
      const { container } = render(<AdSlot surface="postgame" />);
      expect(container.innerHTML).toBe('');
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: previous, configurable: true });
    }
  });
});

describe('ads.txt', () => {
  it('is the verified account, with Google’s own certification id', () => {
    expect(adsTxtBody()).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
  });

  it('is derived from the account id rather than stored twice', () => {
    // The publisher field is the account id minus its `ca-` prefix, so the two cannot
    // drift apart and there is no second value to update.
    expect(adsTxtBody()).toContain(ADSENSE_VERIFICATION_ID.replace(/^ca-/, ''));
    expect(adsTxtBody()).not.toContain(ADSENSE_VERIFICATION_ID);
  });

  it('does not follow the ad-serving switch in either direction', () => {
    // Unset, set to something else, or malformed: the record names the verified owner
    // regardless, because it is not a statement about serving.
    for (const value of [undefined, 'ca-pub-1234567890123456', 'YOUR_PUBLISHER_ID']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
      else process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = value;
      expect(adsTxtBody(), String(value)).toBe('google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0\n');
    }
  });
});

/**
 * Where an ad may appear at all.
 *
 * A rendering test can only prove that the screens somebody remembered to render are
 * clean. This reads the source instead and requires that the component is imported by
 * exactly two modules — so a future ad placed on the booth, a round transition or the
 * consent panel fails here rather than in review.
 */
describe('placement', () => {
  const ALLOWED_IMPORTERS = [
    // The editorial page shell — below the article, above the footer.
    'src/features/editorial/page.tsx',
    // The ending's aftermath — below the reveal, below PLAY AGAIN.
    'src/features/ending/Ending.tsx',
  ];

  const GAMEPLAY_MODULES = [
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
  ];

  it('is confined to the two approved surfaces', () => {
    for (const file of ALLOWED_IMPORTERS) {
      expect(readFileSync(file, 'utf8'), `${file} should render an ad surface`).toContain(
        'AdSlot',
      );
    }
  });

  it('never reaches boot, the menu, the warning, the questions, the booth or a round', () => {
    for (const file of GAMEPLAY_MODULES) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not render advertising`).not.toContain('AdSlot');
      expect(source, `${file} must not load an ad script`).not.toContain('adsbygoogle');
    }
  });

  it('is never loaded from the root layout, so no ad script exists during a game', () => {
    // The library is requested by the slot itself, on the page that shows one — not
    // globally, where it would be downloaded on the boot screen.
    expect(readFileSync('src/app/layout.tsx', 'utf8')).not.toContain('googlesyndication');
  });
});

/**
 * How far an advertisement must sit from PLAY AGAIN.
 *
 * The real distance is measured in a browser by `e2e/phase2.spec.ts`, which can
 * resolve the responsive expression at an actual viewport. This is the companion
 * guard, and it is the one that catches the thing worth catching: somebody editing
 * the number down. jsdom performs no layout, so the stylesheet is read directly.
 */
describe('the post-game ad clearance', () => {
  const css = readFileSync('src/features/ending/Ending.module.css', 'utf8');

  /** The floor from `max(<floor>, …)` on the clearance declaration. */
  const floorPx = (() => {
    const declaration = /--postgame-ad-clearance:\s*([^;]+);/.exec(css);
    if (!declaration) return null;
    const floor = /max\(\s*(\d+(?:\.\d+)?)px/.exec(declaration[1]);
    return floor ? Number(floor[1]) : null;
  })();

  it('is declared once, as a named custom property', () => {
    // One place to read it, one place to change it, and no magic number sitting in a
    // component where nobody would think to look.
    expect(floorPx, '--postgame-ad-clearance must declare a max() floor in px').not.toBeNull();
    expect(css.match(/--postgame-ad-clearance:/g)).toHaveLength(1);
  });

  it('never falls below 150px, and is set to 180px today', () => {
    // 150 is the hard line this test exists to defend; 180 is what it is actually set
    // to, so a well-meaning trim to 160 still fails and has to be argued for.
    expect(floorPx!).toBeGreaterThanOrEqual(150);
    expect(floorPx!).toBe(180);
  });

  it('scales up with the viewport rather than sitting at a fixed height', () => {
    // A tall screen has room to push the ad further down. A fixed spacer would give a
    // desktop the same 180px as a small phone.
    expect(/--postgame-ad-clearance:\s*max\([^;]*vh/.test(css)).toBe(true);
  });

  it('is measured from the button, by subtracting the gap the grid already adds', () => {
    // Without this subtraction the property would be lying by exactly one grid gap —
    // the number in the stylesheet would not be the distance on the screen.
    expect(css).toMatch(
      /margin-top:\s*calc\(var\(--postgame-ad-clearance\)\s*-\s*var\(--aftermath-gap\)\)/,
    );
    expect(css).toMatch(/gap:\s*var\(--aftermath-gap\)/);
  });

  it('is registered as a length, so a browser can resolve and report it', () => {
    // This is what makes the end-to-end measurement possible at all: an unregistered
    // custom property is reported back as the literal text `max(180px, 24vh)`.
    const globals = readFileSync('src/styles/globals.css', 'utf8');
    expect(globals).toMatch(/@property\s+--postgame-ad-clearance\s*\{[^}]*syntax:\s*'<length>'/);
    // The registered initial value is itself the floor, so a stylesheet that failed to
    // apply its override still cannot produce a tighter gap.
    expect(globals).toMatch(/@property\s+--postgame-ad-clearance\s*\{[^}]*initial-value:\s*180px/);
  });

  it('separates PLAY AGAIN from the ad and nothing else', () => {
    // The clearance must be the only thing between them: no other element, and no
    // second margin that could be removed independently.
    const ending = readFileSync('src/features/ending/Ending.tsx', 'utf8');
    const again = ending.indexOf('data-testid="play-again"');
    const advert = ending.indexOf('styles.advert');
    expect(again).toBeGreaterThan(0);
    expect(advert).toBeGreaterThan(again);
    // Nothing renders between the two.
    expect(ending.slice(again, advert)).not.toMatch(/<(section|p|ul|img|button)\b/);
  });
});

describe('no fabricated credentials', () => {
  const SOURCES = [
    'src/lib/ads/config.ts',
    'src/components/ads/AdSlot.tsx',
    'src/app/ads.txt/route.ts',
    'next.config.ts',
    '.env.example',
  ];

  it('appear anywhere in the shipped configuration', () => {
    for (const file of SOURCES) {
      const source = readFileSync(file, 'utf8');
      // A real publisher id is `ca-pub-` followed by sixteen digits. The only digits
      // that may appear near one in this codebase are Google's public certification
      // authority id, which is not an account.
      expect(source, `${file} must not carry a publisher id`).not.toMatch(/ca-pub-\d/);
      expect(source, `${file} must not carry an ads.txt account line`).not.toMatch(
        /google\.com,\s*pub-\d/,
      );
    }
  });

  it('and .env.example ships every advertising variable empty', () => {
    const template = readFileSync('.env.example', 'utf8');
    for (const key of [
      'NEXT_PUBLIC_ADSENSE_CLIENT_ID',
      'NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL',
      'NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME',
      'NEXT_PUBLIC_AD_PLACEHOLDERS',
      'NEXT_PUBLIC_CONTACT_EMAIL',
    ]) {
      expect(template, `${key} must be present`).toContain(`${key}=`);
      expect(template, `${key} must be empty`).toMatch(new RegExp(`^${key}=\\s*$`, 'm'));
    }
  });
});

describe('the content security policy', () => {
  const config = readFileSync('next.config.ts', 'utf8');

  it('adds no advertising host while advertising is unconfigured', () => {
    // The hosts are named in the source, but every list is gated behind a configured
    // publisher id — so the policy this repository emits today is the ad-free one.
    expect(config).toMatch(/adsenseConfigured\s*\?/);
    expect(config).toContain("connect-src 'self'");
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("frame-ancestors 'none'");
  });

  it('never widens a directive to a wildcard', () => {
    expect(config).not.toMatch(/script-src[^`\n]*\*/);
    expect(config).not.toMatch(/connect-src[^`\n]*\*/);
    expect(config).not.toMatch(/frame-src[^`\n]*\*/);
    expect(config).not.toMatch(/img-src[^`\n]*\shttps:(\s|`)/);
  });

  it('keeps the page unframeable whatever advertising does', () => {
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("value: 'DENY'");
  });
});
