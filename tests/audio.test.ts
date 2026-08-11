import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioController,
  GAME_GAIN,
  MENU_FADE_IN_MS,
  MENU_GAIN,
  MODE_GAIN,
  RESULTS_FADE_MS,
  SETTINGS_FADE_MS,
  TRACK_SOURCE,
  TRANSITION_FADE_MS,
} from '@/lib/audio/track';

/**
 * One track, four modes.
 *
 * The controller is driven through injected frames, clocks and element factories, so
 * these tests assert on real fade curves and real playback state without decoding any
 * audio. The things they are really guarding are that the static is never restarted
 * between the menu and the last round, and that nothing moves its level except a mode
 * change.
 */

interface FakeElement {
  src: string;
  volume: number;
  paused: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;
  loop: boolean;
  preload: string;
  playCalls: number;
  pauseCalls: number;
  playRejects: boolean;
  play: () => Promise<void>;
  pause: () => void;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

function makeElement(src: string): FakeElement {
  const element: FakeElement = {
    src,
    volume: 0,
    paused: true,
    currentTime: 0,
    duration: 59.95,
    ended: false,
    loop: false,
    preload: '',
    playCalls: 0,
    pauseCalls: 0,
    playRejects: false,
    play: async () => {
      element.playCalls += 1;
      if (element.playRejects) throw new Error('NotAllowedError');
      element.paused = false;
    },
    pause: () => {
      element.pauseCalls += 1;
      element.paused = true;
    },
    setAttribute: () => {},
    removeAttribute: () => {},
  };
  return element;
}

function harness() {
  const created: FakeElement[] = [];
  let clock = 0;
  const frames: Array<() => void> = [];
  const storage = new Map<string, string>();

  const audio = new AudioController({
    createElement: (src) => {
      const element = makeElement(src);
      created.push(element);
      return element as unknown as HTMLAudioElement;
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

  /** Advance the clock, draining animation frames as a browser would. */
  const advance = (ms: number, steps = 24) => {
    const slice = ms / steps;
    for (let i = 0; i < steps; i += 1) {
      clock += slice;
      const pending = frames.splice(0, frames.length);
      pending.forEach((fn) => fn());
    }
  };

  /** The single media element, created lazily. */
  const element = () => created[0];

  return { audio, advance, element, created, storage };
}

/**
 * Walk the whole opening: ENTER, menu static up, then the accepted warning taking it
 * down to the quiet level. PLAY NOW is not a step here because it does not touch the
 * audio at all — that wiring is proved in `gameAudio.test.ts`.
 */
async function intoGameplay(h: ReturnType<typeof harness>) {
  await h.audio.unlock();
  await h.audio.setMode('menu');
  h.advance(MENU_FADE_IN_MS + 50);
  await h.audio.setMode('game');
  h.advance(TRANSITION_FADE_MS + 50);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('one track', () => {
  it('ships and creates exactly one media element, the menu static', async () => {
    const h = harness();
    await intoGameplay(h);
    h.audio.setMuted(true);
    h.advance(SETTINGS_FADE_MS + 50);
    h.audio.setMuted(false);
    await h.audio.setMode('results');
    h.advance(RESULTS_FADE_MS + 50);
    await h.audio.setMode('game', { restart: true });
    h.advance(TRANSITION_FADE_MS + 50);

    expect(h.created).toHaveLength(1);
    expect(TRACK_SOURCE).toBe('/audio/menu-static.m4a');
    expect(h.element().src).toBe(TRACK_SOURCE);
  });

  it('builds a looping, inline, streaming element attached to the document', async () => {
    // The real factory, in jsdom. A zero-length fade creates the element without ever
    // asking jsdom to play it.
    const audio = new AudioController();
    await audio.setMode('menu', { fadeMs: 0 });

    const element = document.querySelector<HTMLAudioElement>('audio[data-track="static"]');
    expect(element).not.toBeNull();
    expect(element!.getAttribute('src')).toBe(TRACK_SOURCE);
    expect(element!.loop).toBe(true);
    expect(element!.preload).toBe('auto');
    expect(element!.getAttribute('playsinline')).toBe('');
    expect(element!.getAttribute('aria-hidden')).toBe('true');
    audio.dispose();
  });

  it('holds the four mode levels the design asks for', () => {
    expect(MODE_GAIN.silent).toBe(0);
    expect(MODE_GAIN.results).toBe(0);
    expect(MODE_GAIN.menu).toBe(MENU_GAIN);
    expect(MODE_GAIN.game).toBe(GAME_GAIN);
    // Loud at the front, barely audible in play.
    expect(MENU_GAIN).toBeGreaterThanOrEqual(0.9);
    expect(MENU_GAIN).toBeLessThanOrEqual(1);
    expect(GAME_GAIN).toBe(0.24);
    // A marked step down, not a disappearance: a quarter of the menu, not a twelfth.
    expect(GAME_GAIN).toBeLessThan(MENU_GAIN / 3);
    expect(GAME_GAIN).toBeGreaterThan(0.15);
    // Fades within the specified windows.
    expect(MENU_FADE_IN_MS).toBeGreaterThanOrEqual(500);
    expect(MENU_FADE_IN_MS).toBeLessThanOrEqual(700);
    expect(TRANSITION_FADE_MS).toBeGreaterThanOrEqual(1200);
    expect(TRANSITION_FADE_MS).toBeLessThanOrEqual(1800);
    expect(SETTINGS_FADE_MS).toBeGreaterThanOrEqual(300);
    expect(SETTINGS_FADE_MS).toBeLessThanOrEqual(500);
  });
});

describe('boot is silent', () => {
  it('starts in the silent mode with nothing playing', () => {
    const { audio, created } = harness();
    expect(audio.getMode()).toBe('silent');
    expect(audio.isUnlocked()).toBe(false);
    expect(audio.isPlaying()).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('refuses to play until ENTER unlocks it', async () => {
    const { audio, advance, element } = harness();
    await audio.setMode('menu');
    advance(MENU_FADE_IN_MS + 50);
    // The gain moves, because the mode did — but no playback was ever requested.
    expect(element().playCalls).toBe(0);
    expect(audio.isPlaying()).toBe(false);

    await audio.unlock();
    await audio.setMode('menu');
    advance(MENU_FADE_IN_MS + 50);
    expect(element().playCalls).toBe(1);
    expect(audio.isPlaying()).toBe(true);
  });
});

describe('menu', () => {
  it('fades the static up to the loud level', async () => {
    const { audio, advance, element } = harness();
    await audio.unlock();
    await audio.setMode('menu');

    advance(MENU_FADE_IN_MS / 2);
    expect(element().volume).toBeGreaterThan(0);
    expect(element().volume).toBeLessThan(MENU_GAIN);

    advance(MENU_FADE_IN_MS);
    expect(audio.gain()).toBeCloseTo(MENU_GAIN, 5);
    expect(audio.getMode()).toBe('menu');
  });

  it('never restarts when a popup reasserts the menu mode', async () => {
    const h = harness();
    await h.audio.unlock();
    await h.audio.setMode('menu');
    h.advance(MENU_FADE_IN_MS + 50);
    h.element().currentTime = 12.5;

    // ABOUT and SETTINGS open and close over the same screen.
    await h.audio.setMode('menu');
    await h.audio.setMode('menu');
    h.advance(MENU_FADE_IN_MS + 50);

    expect(h.element().playCalls).toBe(1);
    expect(h.element().pauseCalls).toBe(0);
    expect(h.element().currentTime).toBe(12.5);
    expect(h.audio.gain()).toBeCloseTo(MENU_GAIN, 5);
  });
});

describe('accepting the warning', () => {
  it('slides the same playback down to the quiet level without stopping it', async () => {
    const h = harness();
    await h.audio.unlock();
    await h.audio.setMode('menu');
    h.advance(MENU_FADE_IN_MS + 50);
    h.element().currentTime = 31.2;

    await h.audio.setMode('game');
    // Mid-transition: quieter than the menu, still louder than the destination, and
    // still running.
    h.advance(TRANSITION_FADE_MS / 2);
    expect(h.audio.gain()).toBeLessThan(MENU_GAIN);
    expect(h.audio.gain()).toBeGreaterThan(GAME_GAIN);
    expect(h.audio.isPlaying()).toBe(true);

    h.advance(TRANSITION_FADE_MS);
    expect(h.audio.gain()).toBeCloseTo(GAME_GAIN, 5);
    expect(h.element().playCalls).toBe(1);
    expect(h.element().pauseCalls).toBe(0);
    // The position was never touched: the hiss is audibly the same hiss.
    expect(h.element().currentTime).toBe(31.2);
  });

  it('holds a constant level for the whole game, with no modulation of any kind', async () => {
    const h = harness();
    await intoGameplay(h);
    const settled = h.audio.gain();
    expect(settled).toBeCloseTo(GAME_GAIN, 5);

    // Six minutes — longer than fifteen rounds — with nothing but the clock moving.
    const samples: number[] = [];
    for (let minute = 0; minute < 6; minute += 1) {
      h.advance(60_000, 120);
      samples.push(h.audio.gain());
    }

    expect(new Set(samples.map((value) => value.toFixed(6))).size).toBe(1);
    expect(samples[0]).toBeCloseTo(GAME_GAIN, 5);
    expect(h.audio.getSnapshot().fading).toBe(false);
    expect(h.element().pauseCalls).toBe(0);
  });
});

describe('returning to the menu level', () => {
  it('comes back up to loud from the same position', async () => {
    const h = harness();
    await intoGameplay(h);
    h.element().currentTime = 44;

    await h.audio.setMode('menu');
    h.advance(TRANSITION_FADE_MS + 50);

    expect(h.audio.gain()).toBeCloseTo(MENU_GAIN, 5);
    expect(h.audio.getMode()).toBe('menu');
    // No boot, no ENTER, no second playback.
    expect(h.element().playCalls).toBe(1);
    expect(h.element().pauseCalls).toBe(0);
    expect(h.element().currentTime).toBe(44);
  });
});

describe('results', () => {
  it('fades to true silence over the long fade, then pauses and rewinds', async () => {
    const h = harness();
    await intoGameplay(h);
    h.element().currentTime = 51;

    await h.audio.setMode('results');
    h.advance(RESULTS_FADE_MS / 2);
    expect(h.audio.gain()).toBeGreaterThan(0);
    expect(h.audio.isPlaying()).toBe(true);

    h.advance(RESULTS_FADE_MS / 2 + 100);
    expect(h.audio.gain()).toBe(0);
    expect(h.audio.isPlaying()).toBe(false);
    expect(h.element().paused).toBe(true);
    expect(h.element().currentTime).toBe(0);
  });

  it('only ever descends on the way out', async () => {
    const h = harness();
    await intoGameplay(h);
    await h.audio.setMode('results');

    let previous = h.audio.gain();
    for (let step = 0; step < 40; step += 1) {
      h.advance(RESULTS_FADE_MS / 40, 2);
      const current = h.audio.gain();
      expect(current).toBeLessThanOrEqual(previous + 1e-9);
      previous = current;
    }
    expect(previous).toBe(0);
  });

  it('stays silent through the verdict even if the tab is left and returned to', async () => {
    const h = harness();
    await intoGameplay(h);
    await h.audio.setMode('results');
    h.advance(RESULTS_FADE_MS + 100);

    h.audio.suspend();
    h.audio.resume();
    h.advance(1000);

    expect(h.audio.isPlaying()).toBe(false);
    expect(h.audio.gain()).toBe(0);
    expect(h.element().playCalls).toBe(1);
  });
});

describe('PLAY AGAIN', () => {
  it('restarts the static from the top, out of silence, at the quiet level', async () => {
    const h = harness();
    await intoGameplay(h);
    h.element().currentTime = 40;
    await h.audio.setMode('results');
    h.advance(RESULTS_FADE_MS + 100);

    await h.audio.setMode('game', { restart: true });
    // It begins from nothing, at the beginning of the recording.
    expect(h.element().currentTime).toBe(0);
    expect(h.audio.gain()).toBeLessThan(GAME_GAIN);
    expect(h.audio.isPlaying()).toBe(true);
    expect(h.element().playCalls).toBe(2);

    h.advance(TRANSITION_FADE_MS + 100);
    expect(h.audio.gain()).toBeCloseTo(GAME_GAIN, 5);
    expect(h.audio.getMode()).toBe('game');
    // Still the one element, still the one file.
    expect(h.created).toHaveLength(1);
  });
});

describe('MUSIC ON/OFF', () => {
  it('fades out and parks the track, remembering the preference', async () => {
    const h = harness();
    await intoGameplay(h);
    h.element().currentTime = 20;

    h.audio.setMuted(true);
    h.advance(SETTINGS_FADE_MS / 3);
    expect(h.audio.gain()).toBeGreaterThan(0); // faded, not cut
    h.advance(SETTINGS_FADE_MS);

    expect(h.audio.gain()).toBe(0);
    expect(h.audio.isPlaying()).toBe(false);
    expect(h.storage.get('humain.audio.muted')).toBe('true');
    // Parked, not rewound.
    expect(h.element().currentTime).toBe(20);
  });

  it('comes back to the level the current mode asks for', async () => {
    const h = harness();
    await intoGameplay(h);
    h.audio.setMuted(true);
    h.advance(SETTINGS_FADE_MS + 50);

    h.audio.setMuted(false);
    h.advance(SETTINGS_FADE_MS + 50);
    expect(h.audio.gain()).toBeCloseTo(GAME_GAIN, 5);

    await h.audio.setMode('menu');
    h.advance(TRANSITION_FADE_MS + 50);
    h.audio.setMuted(true);
    h.advance(SETTINGS_FADE_MS + 50);
    h.audio.setMuted(false);
    h.advance(SETTINGS_FADE_MS + 50);
    expect(h.audio.gain()).toBeCloseTo(MENU_GAIN, 5);
    expect(h.storage.get('humain.audio.muted')).toBe('false');
  });

  it('cannot make the results screen speak', async () => {
    const h = harness();
    await intoGameplay(h);
    h.audio.setMuted(true);
    h.advance(SETTINGS_FADE_MS + 50);
    await h.audio.setMode('results');
    h.advance(RESULTS_FADE_MS + 100);
    const playsBefore = h.element().playCalls;

    h.audio.setMuted(false);
    h.advance(SETTINGS_FADE_MS + 1000);

    expect(h.audio.gain()).toBe(0);
    expect(h.audio.isPlaying()).toBe(false);
    expect(h.element().playCalls).toBe(playsBefore);
  });

  it('keeps the level at zero while muted, whatever the mode does', async () => {
    const h = harness();
    await h.audio.unlock();
    h.audio.setMuted(true);
    await h.audio.setMode('menu');
    h.advance(MENU_FADE_IN_MS + 50);
    expect(h.audio.gain()).toBe(0);
    await h.audio.setMode('game');
    h.advance(TRANSITION_FADE_MS + 50);
    expect(h.audio.gain()).toBe(0);
    expect(h.audio.isPlaying()).toBe(false);
  });

  it('reads the stored preference before anything can play', async () => {
    const audio = new AudioController({
      createElement: (src) => makeElement(src) as unknown as HTMLAudioElement,
      storage: { getItem: () => 'true', setItem: () => {} },
    });
    expect(audio.isMuted()).toBe(true);
    await audio.unlock();
    await audio.setMode('menu', { fadeMs: 0 });
    expect(audio.gain()).toBe(0);
    expect(audio.isPlaying()).toBe(false);
  });
});

describe('robustness', () => {
  it('treats a refused play() as silence rather than an error', async () => {
    const h = harness();
    await h.audio.unlock();
    // Force the element into existence, then make playback fail.
    await h.audio.setMode('menu', { fadeMs: 0 });
    h.element().paused = true;
    h.element().playRejects = true;

    await expect(h.audio.setMode('game')).resolves.toBeUndefined();
    h.advance(TRANSITION_FADE_MS + 50);
    expect(h.audio.isPlaying()).toBe(false);
    expect(h.audio.getMode()).toBe('game');
  });

  it('cannot be made to play twice by a Strict Mode double invoke', async () => {
    const h = harness();
    await h.audio.unlock();
    await Promise.all([
      h.audio.setMode('menu'),
      h.audio.setMode('menu'),
      h.audio.setMode('menu'),
    ]);
    h.advance(MENU_FADE_IN_MS + 50);

    expect(h.created).toHaveLength(1);
    expect(h.element().playCalls).toBe(1);
  });

  it('lets the newest transition own the gain', async () => {
    const h = harness();
    await h.audio.unlock();
    await h.audio.setMode('menu');
    h.advance(MENU_FADE_IN_MS + 50);

    // A drop to gameplay reversed before its fade finishes.
    await h.audio.setMode('game');
    h.advance(TRANSITION_FADE_MS / 4);
    await h.audio.setMode('menu');
    h.advance(TRANSITION_FADE_MS + 100);

    expect(h.audio.gain()).toBeCloseTo(MENU_GAIN, 5);
    expect(h.audio.getSnapshot().fading).toBe(false);
  });

  it('never exceeds the menu level', async () => {
    const h = harness();
    await h.audio.unlock();
    for (const mode of ['menu', 'game', 'menu', 'results'] as const) {
      await h.audio.setMode(mode);
      for (let step = 0; step < 30; step += 1) {
        h.advance(150, 2);
        expect(h.audio.gain()).toBeLessThanOrEqual(MENU_GAIN + 1e-9);
        expect(h.audio.gain()).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pauses on a hidden tab and resumes the mode that was audible', async () => {
    const h = harness();
    await intoGameplay(h);
    h.element().currentTime = 18;

    h.audio.suspend();
    expect(h.audio.isPlaying()).toBe(false);

    h.audio.resume();
    expect(h.audio.isPlaying()).toBe(true);
    expect(h.element().currentTime).toBe(18);
    expect(h.audio.gain()).toBeCloseTo(GAME_GAIN, 5);
  });

  it('does not resume a muted or locked controller', async () => {
    const locked = harness();
    locked.audio.resume();
    expect(locked.created).toHaveLength(0);

    const muted = harness();
    await intoGameplay(muted);
    muted.audio.setMuted(true);
    muted.advance(SETTINGS_FADE_MS + 50);
    const before = muted.element().playCalls;
    muted.audio.resume();
    expect(muted.element().playCalls).toBe(before);
  });

  it('stops everything on dispose', async () => {
    const h = harness();
    await intoGameplay(h);
    await h.audio.setMode('results');
    h.audio.dispose();
    h.advance(RESULTS_FADE_MS + 100);

    expect(h.element().paused).toBe(true);
    // A disposed controller is inert, not broken.
    await expect(h.audio.setMode('menu')).resolves.toBeUndefined();
  });

  it('publishes a snapshot the UI can render', async () => {
    const h = harness();
    let notifications = 0;
    const stop = h.audio.subscribe(() => {
      notifications += 1;
    });

    await h.audio.unlock();
    await h.audio.setMode('menu');
    expect(h.audio.getSnapshot()).toMatchObject({ unlocked: true, muted: false, mode: 'menu' });
    expect(h.audio.getSnapshot().fading).toBe(true);
    h.advance(MENU_FADE_IN_MS + 50);
    expect(h.audio.getSnapshot()).toMatchObject({ fading: false, playing: true });
    expect(notifications).toBeGreaterThan(0);

    stop();
    const seen = notifications;
    await h.audio.setMode('game');
    expect(notifications).toBe(seen);
  });
});
