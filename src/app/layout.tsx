import type { Metadata, Viewport } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
