import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
const allowSeedRoute = process.env.NEXT_PUBLIC_ALLOW_SEED === 'true';

/**
 * Advertising hosts, added to the policy only when advertising is actually
 * configured.
 *
 * With no `NEXT_PUBLIC_ADSENSE_CLIENT_ID` — which is the state this repository is in
 * — every list below is empty and the emitted policy is byte-identical to the one
 * the game shipped with. Nothing is loosened in advance "so it will work later".
 *
 * The hosts are named individually rather than wildcarded to `*` or to `https:`.
 * Two honest caveats, both recorded in `docs/MONETIZATION.md` so the decision is
 * made deliberately rather than discovered:
 *
 *  - Ad *creatives* are served from advertisers' own domains, so once real units are
 *    running, `img-src` and `frame-src` may need widening beyond this list. That is a
 *    reviewed change, not a pre-emptive one.
 *  - `frame-ancestors 'none'` is untouched by any of this. Ads are framed *by* this
 *    page; this page is still framed by nobody.
 */
const adsenseConfigured = Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim());

const GOOGLE_AD_SCRIPT = [
  'https://pagead2.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://tpc.googlesyndication.com',
];
const GOOGLE_AD_FRAME = [
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
  'https://www.google.com',
];
const GOOGLE_AD_IMAGE = [
  'https://pagead2.googlesyndication.com',
  'https://tpc.googlesyndication.com',
  'https://www.google.com',
  'https://www.gstatic.com',
];
const GOOGLE_AD_CONNECT = [
  'https://pagead2.googlesyndication.com',
  'https://googleads.g.doubleclick.net',
];

/** ` https://a https://b`, or the empty string when advertising is not configured. */
const ads = (hosts: readonly string[]): string => (adsenseConfigured ? ` ${hosts.join(' ')}` : '');

/**
 * Content Security Policy.
 *
 * The page loads nothing from anywhere else — no CDN, no font host, no analytics,
 * no images — so everything is locked to `self`. `unsafe-inline` is required for
 * scripts because Next's hydration bootstrap and the framework's inline style
 * injection both need it without a nonce-issuing middleware, and `unsafe-eval` is
 * only granted in development where the dev overlay needs it.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data:${ads(GOOGLE_AD_IMAGE)}`,
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}${ads(GOOGLE_AD_SCRIPT)}`,
  `connect-src 'self'${ads(GOOGLE_AD_CONNECT)}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  ...(adsenseConfigured ? [`frame-src 'self'${ads(GOOGLE_AD_FRAME)}`] : []),
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Existing E2E journeys historically enter the game at `/?seed=...`. Keep that
   * address working only in the explicitly seeded test build. Production never sets
   * NEXT_PUBLIC_ALLOW_SEED, so its `/` always remains the publisher-content homepage.
   * A rewrite preserves the browser URL while serving the exact `/play` implementation.
   */
  async rewrites() {
    if (!allowSeedRoute) return [];
    return [
      {
        source: '/',
        has: [{ type: 'query', key: 'seed' }],
        destination: '/play',
      },
    ];
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
