import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AudioController,
  GAME_GAIN,
  MENU_FADE_IN_MS,
  MENU_GAIN,
  SETTINGS_FADE_MS,
  TRANSITION_FADE_MS,
  __setAudioForTests,
} from '@/lib/audio/track';
import { useGame } from '@/features/game/useGame';

/**
 * Which player action moves the volume.
 *
 * The controller's own transitions are covered in `audio.test.ts`; what is asserted
 * here is the wiring — that PLAY NOW and BACK leave the level alone, and that
 * accepting the warning is the single thing that quietens the room. That is the part a
 * refactor of the phase handlers could silently get wrong, and the part the design
 * cares about: the drop is the price of committing, not of looking.
 */

interface FakeElement {
  volume: number;
  paused: boolean;
  currentTime: number;
  play: () => Promise<void>;
  pause: () => void;
  setAttribute: () => void;
  removeAttribute: () => void;
}

function scene() {
  let clock = 0;
  const frames: Array<() => void> = [];
  const storage = new Map<string, string>();
  let element: FakeElement | null = null;

  const controller = new AudioController({
    createElement: () => {
      const made: FakeElement = {
        volume: 0,
        paused: true,
        currentTime: 0,
        play: async () => {
          made.paused = false;
        },
        pause: () => {
          made.paused = true;
        },
        setAttribute: () => {},
        removeAttribute: () => {},
      };
      element = made;
      return made as unknown as HTMLAudioElement;
    },
    now: () => clock,
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelFrame: () => {},
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  __setAudioForTests(controller);

  /**
   * Run every fade in flight to completion.
   *
   * Asynchronous by necessity: the controller reaches `play()` before it starts its
   * fade, so the transition only exists after the microtask queue has drained.
   */
  const settle = async (ms = TRANSITION_FADE_MS + 100) => {
    await act(async () => {
      for (let i = 0; i < 24; i += 1) {
        clock += ms / 24;
        frames.splice(0, frames.length).forEach((fn) => fn());
        await Promise.resolve();
      }
    });
  };

  return { controller, settle, position: () => element?.currentTime ?? 0 };
}

let current: ReturnType<typeof scene>;

beforeEach(() => {
  current = scene();
});

afterEach(() => {
  current.controller.dispose();
  __setAudioForTests(null);
});

/** ENTER, then the menu static settled at full volume. */
async function atMenu() {
  const { result } = renderHook(() => useGame());
  await act(async () => {
    result.current.enterMenu();
  });
  await current.settle(MENU_FADE_IN_MS + 100);
  expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);
  expect(current.controller.getMode()).toBe('menu');
  return result;
}

describe('the warning stays at full volume', () => {
  it('opens on PLAY NOW without touching the level', async () => {
    const result = await atMenu();

    await act(async () => {
      result.current.openConsent();
    });
    expect(result.current.state.phase).toBe('consent');
    // No fade was even started, let alone finished.
    expect(current.controller.getSnapshot().fading).toBe(false);
    expect(current.controller.getMode()).toBe('menu');
    expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);

    // Still loud however long the warning is left open and read.
    await current.settle(60_000);
    expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);
    expect(current.controller.isPlaying()).toBe(true);
  });

  it('stays loud through BACK, and through opening it again', async () => {
    const result = await atMenu();

    await act(async () => {
      result.current.openConsent();
    });
    await act(async () => {
      result.current.closeConsent();
    });
    expect(result.current.state.phase).toBe('menu');
    expect(current.controller.getSnapshot().fading).toBe(false);
    expect(current.controller.getMode()).toBe('menu');
    expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);

    await current.settle();
    await act(async () => {
      result.current.openConsent();
    });
    await current.settle();
    expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);
  });
});

describe('accepting the warning is what quietens it', () => {
  it('fades from the menu level down to the gameplay level', async () => {
    const result = await atMenu();
    await act(async () => {
      result.current.openConsent();
    });
    const before = current.position();

    await act(async () => {
      result.current.acceptConsent();
    });
    expect(result.current.state.phase).toBe('choice');
    expect(current.controller.getMode()).toBe('game');
    // Mid-fade: on its way down, not there yet.
    expect(current.controller.getSnapshot().fading).toBe(true);
    expect(current.controller.gain()).toBeGreaterThan(GAME_GAIN);

    await current.settle();
    expect(current.controller.gain()).toBeCloseTo(GAME_GAIN, 5);
    // Never stopped, never rewound: the same playback, quieter.
    expect(current.controller.isPlaying()).toBe(true);
    expect(current.position()).toBe(before);
  });

  it('then holds that level for longer than a whole game', async () => {
    const result = await atMenu();
    await act(async () => {
      result.current.openConsent();
    });
    await act(async () => {
      result.current.acceptConsent();
    });
    await current.settle();

    // Nothing downstream of acceptance — no question, no round, no phase change —
    // has any business moving the gain again.
    for (let minute = 0; minute < 10; minute += 1) {
      await current.settle(60_000);
      expect(current.controller.gain()).toBeCloseTo(GAME_GAIN, 5);
    }
    expect(current.controller.getMode()).toBe('game');
    expect(current.controller.getSnapshot().fading).toBe(false);
  });

  it('changes the mode without making a sound when music is off', async () => {
    const result = await atMenu();
    current.controller.setMuted(true);
    await current.settle(SETTINGS_FADE_MS + 100);
    expect(current.controller.gain()).toBe(0);

    await act(async () => {
      result.current.openConsent();
    });
    await act(async () => {
      result.current.acceptConsent();
    });
    await current.settle();

    // The mode moved on; the room stayed silent.
    expect(current.controller.getMode()).toBe('game');
    expect(current.controller.gain()).toBe(0);
    expect(current.controller.isPlaying()).toBe(false);

    // Music back on now restores the gameplay level, not the menu level.
    current.controller.setMuted(false);
    await current.settle(SETTINGS_FADE_MS + 100);
    expect(current.controller.gain()).toBeCloseTo(GAME_GAIN, 5);
  });

  it('leaves MUSIC ON restoring the menu level if the warning was declined', async () => {
    const result = await atMenu();
    await act(async () => {
      result.current.openConsent();
    });
    await act(async () => {
      result.current.closeConsent();
    });

    current.controller.setMuted(true);
    await current.settle(SETTINGS_FADE_MS + 100);
    current.controller.setMuted(false);
    await current.settle(SETTINGS_FADE_MS + 100);

    expect(current.controller.getMode()).toBe('menu');
    expect(current.controller.gain()).toBeCloseTo(MENU_GAIN, 5);
  });
});
