/**
 * The audio controller.
 *
 * One media element, one recording — a minute of television static — for the whole
 * session. It is never stopped between screens and never swapped for a second bed;
 * what changes is only how loud it is. That is the entire design, and it is why the
 * hiss under the booth is recognisably the same hiss that was roaring on the menu.
 *
 * Four modes, and nothing between them:
 *
 *  - `silent`  — nothing audible. Boot, and before ENTER.
 *  - `menu`    — loud. The title screen, ABOUT, SETTINGS, and the whole warning.
 *  - `game`    — a constant, clearly quieter electrical hiss. Everything from the
 *                accepted warning through the fifteenth round.
 *  - `results` — silence again, reached by a long fade and then paused.
 *
 * Three things it is strict about:
 *  - **Nothing plays before a user gesture.** `unlock()` is the only thing that can
 *    permit playback, and it is called from the ENTER click.
 *  - **One fade at a time.** Every fade cancels the one before it, so competing
 *    transitions can never fight over the same gain.
 *  - **A rejected `play()` is not an error.** Autoplay refusal, a missing file, an
 *    unsupported codec — all of it degrades to silence and the game continues.
 *
 * The gain moves only when a mode changes. There is no breathing, no pulsing, no
 * modulation and no rhythm: during play it is a flat 0.24 and it stays there.
 *
 * Volume is set on the media element rather than through a Web Audio graph, because
 * an `<audio>` element streams from disk where decoding the file into an AudioBuffer
 * would cost megabytes of memory on a phone.
 */

/** The only audio asset the application ships. */
export const TRACK_SOURCE = '/audio/menu-static.m4a';

export type AudioMode = 'silent' | 'menu' | 'game' | 'results';

/** Menu static: loud, the front of the house. */
export const MENU_GAIN = 0.95;
/**
 * Gameplay: a marked step down from the menu, but still plainly there. Low enough to
 * stop being the loudest thing in the room, high enough that it never reads as the
 * sound having been switched off.
 */
export const GAME_GAIN = 0.24;

/** The gain each mode holds. Nothing else sets a level. */
export const MODE_GAIN: Record<AudioMode, number> = {
  silent: 0,
  menu: MENU_GAIN,
  game: GAME_GAIN,
  results: 0,
};

/** Fade used when the static first arrives on the menu. */
export const MENU_FADE_IN_MS = 600;
/** Accepting the warning: the same element sliding between the two levels. */
export const TRANSITION_FADE_MS = 1500;
/** Music on/off from settings. */
export const SETTINGS_FADE_MS = 400;
/** The long fade to silence when the results begin. */
export const RESULTS_FADE_MS = 3200;

export interface AudioSnapshot {
  /** True once a user gesture has permitted playback. */
  unlocked: boolean;
  muted: boolean;
  mode: AudioMode;
  /** Current element volume, for the UI and for tests. */
  gain: number;
  /** True while a fade is in flight. */
  fading: boolean;
  playing: boolean;
}

interface Deps {
  createElement: (src: string) => HTMLAudioElement;
  now: () => number;
  requestFrame: (fn: () => void) => number;
  cancelFrame: (id: number) => void;
  /** Where the mute preference lives. Optional so tests can omit it. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

const MUTE_KEY = 'humain.audio.muted';

function defaultDeps(): Deps {
  return {
    createElement: (src) => {
      const element = document.createElement('audio');
      element.src = src;
      element.preload = 'auto';
      // A single texture with no musical content: the browser's own loop is seamless
      // enough, and there is no seam to mask because the level never moves.
      element.loop = true;
      element.volume = 0;
      element.setAttribute('playsinline', '');
      /*
       * Attached to the document rather than left detached. An `<audio>` with no
       * `controls` renders nothing, so this costs no layout — and being in the tree
       * makes playback more dependable on iOS and lets the live audio test inspect
       * the real element instead of trusting application state.
       */
      element.setAttribute('aria-hidden', 'true');
      element.dataset.track = 'static';
      document.body.appendChild(element);
      return element;
    },
    now: () => performance.now(),
    requestFrame: (fn) => window.requestAnimationFrame(fn),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    storage: typeof window === 'undefined' ? null : window.localStorage,
  };
}

interface Fade {
  frame: number | null;
  from: number;
  to: number;
  start: number;
  duration: number;
  onDone?: () => void;
}

export interface ModeOptions {
  /**
   * Rewind to zero and come up from silence. Only PLAY AGAIN wants this; every other
   * transition keeps its position so the static is audibly continuous.
   */
  restart?: boolean;
  fadeMs?: number;
}

export class AudioController {
  private readonly deps: Deps;
  private element: HTMLAudioElement | null = null;
  private fade: Fade | null = null;
  private listeners = new Set<() => void>();

  private unlocked = false;
  private muted: boolean;
  private mode: AudioMode = 'silent';
  private disposed = false;

  constructor(deps: Partial<Deps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
    this.muted = this.readMuted();
  }

  // --- subscription --------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  getSnapshot(): AudioSnapshot {
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      mode: this.mode,
      gain: this.gain(),
      fading: this.fade !== null,
      playing: this.isPlaying(),
    };
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  isMuted(): boolean {
    return this.muted;
  }

  getMode(): AudioMode {
    return this.mode;
  }

  /** Current element volume. */
  gain(): number {
    return this.element?.volume ?? 0;
  }

  isPlaying(): boolean {
    return Boolean(this.element && !this.element.paused);
  }

  /** Playback position, for tests and the live audio check. */
  position(): number {
    return this.element?.currentTime ?? 0;
  }

  // --- the element ---------------------------------------------------------

  private media(): HTMLAudioElement {
    if (!this.element) this.element = this.deps.createElement(TRACK_SOURCE);
    return this.element;
  }

  /**
   * Start playback if it is not already running.
   *
   * Idempotent by design: calling this twice — as Strict Mode's double-invoke will —
   * cannot produce two overlapping playbacks, because the second call sees the
   * element already unpaused and does nothing.
   */
  private async ensurePlaying(): Promise<void> {
    if (!this.unlocked || this.muted || this.disposed) return;
    const element = this.media();
    if (!element.paused) return;
    try {
      await element.play();
    } catch {
      // Autoplay refusal, decode failure, missing file: stay silent, keep playing
      // the game. Nothing here is allowed to throw into the UI.
    }
  }

  private rewind(): void {
    try {
      if (this.element) this.element.currentTime = 0;
    } catch {
      /* not seekable yet; it will start from wherever it can */
    }
  }

  // --- fades ---------------------------------------------------------------

  /** Cancel the fade in flight. The new transition owns the gain now. */
  private cancelFade(): void {
    if (!this.fade) return;
    if (this.fade.frame !== null) this.deps.cancelFrame(this.fade.frame);
    this.fade = null;
  }

  private setGain(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    // No reason to create a media element purely to hold silence — a game muted from
    // the first frame should never load the file at all.
    if (!this.element && clamped === 0) return;
    this.media().volume = clamped;
  }

  fadeTo(to: number, durationMs: number, onDone?: () => void): void {
    this.cancelFade();
    const from = this.gain();
    const target = Math.max(0, Math.min(1, to));

    if (durationMs <= 0 || from === target) {
      this.setGain(target);
      onDone?.();
      this.notify();
      return;
    }

    const fade: Fade = {
      frame: null,
      from,
      to: target,
      start: this.deps.now(),
      duration: durationMs,
      onDone,
    };
    this.fade = fade;

    const step = () => {
      if (this.disposed) return;
      if (this.fade !== fade) return; // superseded
      const elapsed = this.deps.now() - fade.start;
      const t = Math.min(1, elapsed / fade.duration);
      // Equal-power-ish curve: linear on gain sounds abrupt at the quiet end.
      const eased = t * t * (3 - 2 * t);
      this.setGain(fade.from + (fade.to - fade.from) * eased);

      if (t >= 1) {
        this.fade = null;
        fade.onDone?.();
        this.notify();
        return;
      }
      fade.frame = this.deps.requestFrame(step);
    };

    fade.frame = this.deps.requestFrame(step);
    this.notify();
  }

  // --- modes ---------------------------------------------------------------

  /** The one thing that may permit playback. Called from the ENTER gesture. */
  async unlock(): Promise<void> {
    this.unlocked = true;
    this.notify();
  }

  /**
   * How long each transition takes when the caller does not say.
   *
   * Arriving on the menu from silence is a short fade-in. Moving between the menu and
   * gameplay levels is the long one, in either direction, because it happens
   * underneath a screen change and must not be noticed as an event of its own.
   */
  private defaultFade(next: AudioMode, previous: AudioMode): number {
    if (next === 'results') return RESULTS_FADE_MS;
    if (next === 'silent') return SETTINGS_FADE_MS;
    if (next === 'menu') return previous === 'game' ? TRANSITION_FADE_MS : MENU_FADE_IN_MS;
    return TRANSITION_FADE_MS;
  }

  /**
   * Move to a mode.
   *
   * The element is not stopped, restarted or recreated on the way to an audible mode
   * — only its gain moves — unless `restart` is asked for explicitly. `results` is
   * the only mode that pauses and rewinds, and it does so after its fade completes so
   * the ending is reached in true silence.
   */
  async setMode(mode: AudioMode, { restart = false, fadeMs }: ModeOptions = {}): Promise<void> {
    if (this.disposed) return;
    const duration = fadeMs ?? this.defaultFade(mode, this.mode);
    this.mode = mode;

    if (mode === 'results' || mode === 'silent') {
      this.fadeTo(0, duration, () => {
        this.element?.pause();
        this.rewind();
        this.notify();
      });
      this.notify();
      return;
    }

    if (restart) {
      // Come back from nothing: silent, at the top of the recording.
      this.cancelFade();
      this.setGain(0);
      this.rewind();
    }
    await this.ensurePlaying();
    // While muted the level still tracks the mode; it is simply held at zero, so
    // switching music back on lands on the right target without a second transition.
    this.fadeTo(this.muted ? 0 : MODE_GAIN[mode], duration);
    this.notify();
  }

  // --- mute ----------------------------------------------------------------

  /**
   * MUSIC ON/OFF.
   *
   * Off fades out and parks the element where it is. On brings back whatever the
   * current mode asks for — which for `results` is nothing at all, so turning music
   * back on during the ending cannot make it speak.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.writeMuted(muted);

    if (muted) {
      this.fadeTo(0, SETTINGS_FADE_MS, () => {
        // Paused, not rewound: the position is kept so switching music back on
        // continues the same static rather than restarting it. The exception is a
        // mode that wanted silence anyway — muting mid-results supersedes that fade,
        // so its rewind has to happen here instead.
        this.element?.pause();
        if (this.mode === 'results' || this.mode === 'silent') this.rewind();
        this.notify();
      });
      this.notify();
      return;
    }

    if (this.mode === 'menu' || this.mode === 'game') {
      void this.ensurePlaying();
      this.fadeTo(MODE_GAIN[this.mode], SETTINGS_FADE_MS);
    }
    this.notify();
  }

  private readMuted(): boolean {
    try {
      // Absent preference means audible: the game is meant to be heard, and nothing
      // can play before ENTER anyway.
      return this.deps.storage?.getItem(MUTE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private writeMuted(muted: boolean): void {
    try {
      this.deps.storage?.setItem(MUTE_KEY, muted ? 'true' : 'false');
    } catch {
      /* a browser without storage simply forgets the preference */
    }
  }

  // --- visibility and teardown --------------------------------------------

  /** Pause without forgetting the mode. */
  suspend(): void {
    this.element?.pause();
    this.notify();
  }

  /** Resume, but only if something is meant to be audible. */
  resume(): void {
    if (!this.unlocked || this.muted) return;
    if (this.mode !== 'menu' && this.mode !== 'game') return;
    void this.ensurePlaying();
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelFade();
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.remove?.();
    }
    this.element = null;
    this.listeners.clear();
  }
}

let singleton: AudioController | null = null;

/**
 * The process-wide controller.
 *
 * A module singleton on purpose: it must outlive every component, and it must not be
 * recreated by Strict Mode's double mount, or the second instance would start its own
 * copy of the static over the first.
 */
export function getAudio(): AudioController {
  if (!singleton) singleton = new AudioController();
  return singleton;
}

/** Test seam. */
export function __setAudioForTests(instance: AudioController | null): void {
  singleton = instance;
}
