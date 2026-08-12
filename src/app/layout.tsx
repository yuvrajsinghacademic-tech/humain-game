import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'hum(ai)n — will you be replaced?',
  description:
    'An AI named Darry is learning how to predict you. Psychological horror, fifteen rounds, one verdict.',
  robots: { index: true, follow: true },
  // The whole piece is one dark surface; tell the browser so form controls and
  // scrollbars match instead of flashing white.
  other: { 'color-scheme': 'dark' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07070a',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/*
          Page views only. Nothing this game learns about a player is passed to it: no
          profile, no choices, no verdict.

          In production the script is `/_vercel/insights/script.js`, served from this
          origin by Vercel's proxy, so the existing `script-src 'self'` and
          `connect-src 'self'` already allow it and the policy is unchanged. In
          development the package instead asks for a debug script on
          `va.vercel-scripts.com`, which this policy blocks — deliberately left blocked,
          since analytics does not function on localhost anyway and widening the policy
          to accommodate a development convenience would be the wrong trade.
        */}
        <Analytics />
      </body>
    </html>
  );
}
