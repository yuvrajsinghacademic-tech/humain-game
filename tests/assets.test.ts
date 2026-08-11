import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACK_SOURCE } from '@/lib/audio/track';

/**
 * The deployed audio asset, and the policy that lets the browser load it.
 */

const PUBLIC = 'public';

describe('the audio asset', () => {
  it('exists', () => {
    expect(existsSync(`${PUBLIC}${TRACK_SOURCE}`), `${TRACK_SOURCE} is missing`).toBe(true);
  });

  it('is the only one shipped', () => {
    const shipped = readdirSync(`${PUBLIC}/audio`);
    expect(shipped).toEqual([TRACK_SOURCE.replace('/audio/', '')]);
  });

  it('is an MPEG-4 audio container, not a video file', () => {
    const head = readFileSync(`${PUBLIC}${TRACK_SOURCE}`).subarray(0, 64).toString('latin1');
    // `ftyp` brand near the start, and an audio-only M4A brand.
    expect(head).toContain('ftyp');
    expect(head).toMatch(/M4A|mp42|isom/);
    // No video sample-description boxes anywhere near the header.
    expect(head).not.toContain('avc1');
    expect(head).not.toContain('hvc1');
  });

  it('is small enough to serve', () => {
    // A minute of static.
    expect(statSync(`${PUBLIC}${TRACK_SOURCE}`).size).toBeLessThan(2 * 1024 * 1024);
  });

  it('never references an original recording', () => {
    expect(TRACK_SOURCE).not.toMatch(/\.mov$/i);
    expect(TRACK_SOURCE).not.toMatch(/ScreenRecording|video-output/i);
  });

  it('keeps the source recordings out of the repository', () => {
    const ignore = readFileSync('.gitignore', 'utf8');
    expect(ignore).toMatch(/\*\.mov/i);
    expect(ignore).toMatch(/\*\.MOV/);
  });

  it('leaves no trace of the retired gameplay bed', () => {
    /*
     * The second track is gone, not merely unreferenced. This fails if a call site,
     * constant or asset comes back — the whole experience is one recording now.
     */
    expect(existsSync(`${PUBLIC}/audio/game-ambience.m4a`)).toBe(false);
    expect(existsSync('src/lib/audio/tracks.ts'), 'the two-track controller is gone').toBe(false);

    // Identifiers rather than prose, so the documentation stays free to say that the
    // breathing and loop-masking machinery was removed.
    const retired = [
      'game-ambience',
      'TRACK_SOURCES',
      'startBreathing',
      'BREATH_RAMP',
      'GAME_GAIN_FAINT',
      'startLoopMask',
      'LOOP_DUCK',
      'silenceForResults',
      'playGame',
    ];
    for (const path of ['src/lib/audio/track.ts', 'src/lib/audio/useTrack.ts', 'src/features/game/useGame.ts', 'src/features/game/Game.tsx']) {
      const text = readFileSync(path, 'utf8');
      for (const name of retired) {
        expect(text.includes(name), `${path} still references ${name}`).toBe(false);
      }
    }
  });
});

describe('content security policy', () => {
  const config = readFileSync('next.config.ts', 'utf8');

  it("allows media from 'self', or no track can ever load", () => {
    /*
     * Regression guard. This was `media-src 'none'` from when the game was silent, and
     * it blocked every track with "Media load rejected by URL safety check" — audio
     * that worked in every unit test and was silent in the actual browser.
     */
    expect(config).toContain("media-src 'self'");
    expect(config).not.toContain("media-src 'none'");
  });

  it('still refuses to talk to any other host', () => {
    expect(config).toContain("connect-src 'self'");
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
  });
});
