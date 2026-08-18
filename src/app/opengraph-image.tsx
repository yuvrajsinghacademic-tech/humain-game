/**
 * The social card.
 *
 * When somebody finishes the game and shares it, this image is the whole first
 * impression — it arrives in a message thread before any of the writing does. So it
 * is built from the same four values as everything else: true black, cold off-white,
 * one error red, and a great deal of empty space.
 *
 * Generated at build time into a static PNG rather than rendered per request, so it
 * costs nothing to serve and cannot fail while somebody is trying to share. It is
 * picked up automatically by the root layout's metadata and inherited by every route
 * that does not override it, including the campaign addresses.
 *
 * Deliberately not personalised. A per-player result card would mean putting a
 * player's numbers in a URL and generating an image from it — which is a record of a
 * playthrough, on a server, addressable by anybody who has the link. The share text
 * carries the numbers instead; see `src/lib/share/result.ts`.
 */

import { ImageResponse } from 'next/og';

export const alt = 'hum(ai)n — will you be replaced?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#000000',
          padding: '72px 80px',
        }}
      >
        {/* Scanlines, drawn as a repeating gradient rather than an asset. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 12, height: 12, background: '#ff2b32', display: 'flex' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              letterSpacing: 8,
              color: '#5f6163',
              textTransform: 'uppercase',
            }}
          >
            Prediction Booth — 15 rounds
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', fontSize: 108, letterSpacing: -4, color: '#e4e4e2' }}>
            <span>hum</span>
            <span style={{ color: '#ff2b32' }}>(ai)</span>
            <span>n</span>
          </div>
          <div style={{ display: 'flex', fontSize: 54, letterSpacing: -1, color: '#9a9c9b' }}>
            will you be replaced?
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #1d1f22',
            paddingTop: 26,
          }}
        >
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#5f6163' }}>
            An AI named Darry is learning how to predict you.
          </div>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#9a9c9b' }}>
            willyoubereplaced.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
