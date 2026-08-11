import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Content Security Policy.
 *
 * The page loads nothing from anywhere else — no CDN, no font host, no analytics,
 * no images — so everything is locked to `self`. `unsafe-inline` is required for
 * scripts because Next's hydration bootstrap and the framework's inline style
 * injection both need it without a nonce-issuing middleware, and `unsafe-eval` is
 * only granted in development where the dev overlay needs it.
 *
 * `connect-src 'self'` is the meaningful one here: even if something managed to
 * inject script, it could not exfiltrate a behavioural profile to another host.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  // The one audio asset is served from `public/audio`. This was `'none'` while the
  // game was silent; leaving it that way blocked the track with a "Media load rejected
  // by URL safety check" and no audio at all.
  "media-src 'self'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    // The game explicitly wants none of these, and says so in its privacy note.
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
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Nothing from the API is ever cacheable; each response is session-bound.
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
