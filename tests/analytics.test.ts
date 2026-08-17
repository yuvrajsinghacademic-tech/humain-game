import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, isAnalyticsEvent, sanitizeProperties, track } from '@/lib/analytics/events';

/**
 * Product analytics.
 *
 * Six counters exist so it is possible to know whether a sticker on Sunset produced
 * anyone who finished the game. Nothing about the person is supposed to travel with
 * them, and "supposed to" is not good enough — the helper enforces it with a closed
 * list of names and a per-event allowlist of property *values*, and this is where that
 * is proved.
 *
 * The spy is on the underlying provider call, so these assertions are about what would
 * actually leave the browser rather than about what the wrapper intended.
 */

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock('@vercel/analytics', () => ({ track: trackSpy }));

beforeEach(() => trackSpy.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('the event vocabulary', () => {
  it('is the funnel and nothing else', () => {
    expect([...EVENTS]).toEqual([
      'play_started',
      'assessment_completed',
      'booth_started',
      'game_completed',
      'play_again',
      'share_clicked',
    ]);
  });

  it('recognises only those names', () => {
    for (const event of EVENTS) expect(isAnalyticsEvent(event)).toBe(true);
    for (const other of ['profile_derived', 'answer_given', 'verdict', 'round_result']) {
      expect(isAnalyticsEvent(other)).toBe(false);
    }
  });

  it('sends a recognised event through', () => {
    track('game_completed');
    expect(trackSpy).toHaveBeenCalledTimes(1);
    expect(trackSpy).toHaveBeenCalledWith('game_completed');
  });

  it('drops an unrecognised one rather than passing it on', () => {
    // @ts-expect-error — the point of the test is the runtime guard behind the type.
    track('psychological_profile');
    expect(trackSpy).not.toHaveBeenCalled();
  });
});

describe('event properties', () => {
  it('carries the share method, which is the only detail any event may have', () => {
    track('share_clicked', { method: 'native' });
    expect(trackSpy).toHaveBeenCalledWith('share_clicked', { method: 'native' });

    trackSpy.mockReset();
    track('share_clicked', { method: 'clipboard' });
    expect(trackSpy).toHaveBeenCalledWith('share_clicked', { method: 'clipboard' });
  });

  it('discards a method that is not one of the two', () => {
    track('share_clicked', { method: 'A,B,A,A — 812ms' });
    expect(trackSpy).toHaveBeenCalledWith('share_clicked');
  });

  it('discards every property on an event that declares none', () => {
    track('game_completed', { method: 'native' });
    expect(trackSpy).toHaveBeenCalledWith('game_completed');
  });

  it('strips a behavioural payload down to nothing', () => {
    // The exact shape the brief forbids, passed deliberately.
    const contaminated = {
      answers: 'AABBA',
      psychologicalProfile: 'compulsive-repeater',
      winStayRate: '0.81',
      verdict: 'replaced',
      rounds: '15',
      accuracy: '73',
      reasoning: 'Holds the lever that has just paid out.',
      sessionId: 'sid-abcdef',
    };

    expect(sanitizeProperties('game_completed', contaminated)).toEqual({});
    expect(sanitizeProperties('share_clicked', contaminated)).toEqual({});

    track('game_completed', contaminated);
    const call = trackSpy.mock.calls[0];
    expect(call).toEqual(['game_completed']);
    expect(JSON.stringify(call)).not.toMatch(/compulsive|0\.81|replaced|abcdef|Holds the lever/);
  });

  it('keeps only the allowed key when it is mixed in with forbidden ones', () => {
    expect(
      sanitizeProperties('share_clicked', {
        method: 'clipboard',
        psychologicalProfile: 'compulsive-repeater',
        answers: 'AABBA',
      }),
    ).toEqual({ method: 'clipboard' });
  });
});

describe('failure', () => {
  it('is never allowed to reach the player', () => {
    // Custom events are a plan-dependent feature and analytics does not run on
    // localhost at all. Neither is an error, and neither may break an ending.
    // `…Once`, so the failure belongs to the single call under test. The runner
    // touches the spy again during its own post-test cleanup, and a permanently
    // throwing implementation would surface there as an unrelated failure.
    trackSpy.mockImplementationOnce(() => {
      throw new Error('analytics unavailable');
    });
    expect(() => track('game_completed')).not.toThrow();
    expect(trackSpy).toHaveBeenCalledTimes(1);
  });
});
