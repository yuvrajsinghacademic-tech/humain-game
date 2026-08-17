import { describe, expect, it } from 'vitest';
import {
  SHARE_DOMAIN,
  SHARE_URL,
  shareClipboardText,
  shareData,
  shareText,
  type ShareableResult,
} from '@/lib/share/result';

/**
 * The share text.
 *
 * The one property that genuinely matters here is negative: a share must not carry
 * anything private. The player's answers, their timings, the profile Darry built,
 * Darry's own reasoning and the closing line it wrote for them are the private part
 * of the experience, and the whole viral loop is worth abandoning before any of that
 * leaves the device.
 *
 * That is asserted by handing the builder an object carrying planted secrets in extra
 * fields and requiring that none of them survive — a stronger check than reading the
 * output and agreeing it looks fine, because it fails the moment somebody widens the
 * input type and starts interpolating more of it.
 */

const result: ShareableResult = { darry: 73, you: 27, correct: 11, rounds: 15 };

describe('share text', () => {
  it('carries the score and the invitation', () => {
    const text = shareText(result);
    expect(text).toContain('11 of my 15 choices');
    expect(text).toContain('73%');
    expect(text).toContain('hum(ai)n');
    expect(text).toContain(SHARE_DOMAIN);
    // Something to beat, rather than an ending somebody else has been told.
    expect(text).toMatch(/harder to read/i);
  });

  it('is short enough to post anywhere', () => {
    expect(shareText(result).length).toBeLessThanOrEqual(200);
  });

  it('sends people to the homepage, never to a campaign address', () => {
    // A share that carried `/sunset-a` would file the friend's visit under the
    // sticker they never saw, and quietly corrupt the placement numbers.
    expect(SHARE_URL).toBe('https://www.willyoubereplaced.com/');
    expect(shareData(result).url).toBe(SHARE_URL);
    expect(shareClipboardText(result)).not.toMatch(/willyoubereplaced\.com\/[a-z]/);
  });

  it('leaks nothing private, even when handed it', () => {
    const contaminated = {
      ...result,
      // None of these are fields the builder reads. If one is ever added to the type
      // and interpolated without thought, this fails.
      answers: ['A', 'B', 'A', 'A'],
      profile: { winStayRate: 0.81, leftBias: 0.62 },
      psychologicalProfile: 'compulsive-repeater',
      reasoning: 'Holds the lever that has just paid out.',
      finalObservation: 'You never once chose differently.',
      sessionId: 'sid-abcdef',
      gameId: 'game-abcdef',
      history: [{ round: 1, choice: 'A', ms: 812 }],
    } as unknown as ShareableResult;

    const text = `${shareText(contaminated)} ${shareClipboardText(contaminated)} ${JSON.stringify(
      shareData(contaminated),
    )}`;

    for (const secret of [
      'winStayRate',
      'leftBias',
      'compulsive',
      'Holds the lever',
      'never once chose',
      'sid-abcdef',
      'game-abcdef',
      '812',
    ]) {
      expect(text, `share text must not contain ${secret}`).not.toContain(secret);
    }
  });

  it('survives nonsense numbers without producing nonsense text', () => {
    const broken = shareText({
      darry: Number.NaN,
      you: Number.POSITIVE_INFINITY,
      correct: -4,
      rounds: 15,
    });
    expect(broken).not.toContain('NaN');
    expect(broken).not.toContain('Infinity');
    expect(broken).not.toContain('-');
  });

  it('never claims more correct calls than rounds played', () => {
    expect(shareText({ darry: 100, you: 0, correct: 99, rounds: 15 })).toContain('15 of my 15');
  });
});

describe('the share payload', () => {
  it('is a title, a text and a URL, and nothing else', () => {
    // Exactly the fields `navigator.share` accepts for a text share. Anything extra
    // would be a field somebody added without asking what ends up in it.
    expect(Object.keys(shareData(result)).sort()).toEqual(['text', 'title', 'url']);
  });
});
