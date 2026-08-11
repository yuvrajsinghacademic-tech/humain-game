/**
 * The randomised glitch scheduler.
 *
 * Three independent layers run at once, each with its own cadence and its own
 * repertoire, which is what stops the screen from ever settling:
 *
 *   micro   0.35–0.95s  constant low-level interference
 *   medium  1.4–3.2s    visible faults across the composition
 *   hard    5–10s       the whole centre coming apart
 *
 * The catalogues are disjoint, so a layer can never collide with another layer's
 * effect, and each layer refuses to repeat its own last event. A shared arbiter
 * caps the total number of simultaneous effects across all three.
 *
 * Deliberately framework-free: timers, randomness, visibility and the concurrency
 * budget all arrive as dependencies, which is what lets the tests drive it without
 * touching the DOM.
 */

export type GlitchName =
  // --- micro: constant, small, everywhere -----------------------------------
  /** One or two corrupted glyphs in the wordmark. */
  | 'glyphs'
  /** A small RGB separation on the wordmark. */
  | 'chroma'
  /** A short horizontal fragment across the centre. */
  | 'fragment'
  /** A band where the scanlines skip. */
  | 'scanline-skip'
  /** Dead signal cells and stuck red pixels. */
  | 'dead-cells'
  /** The button's border falling out of alignment. */
  | 'button-skew'
  /** A small portion of the wordmark nudged sideways. */
  | 'logo-nudge'
  /** The wordmark briefly resolving out of garbage, as if decoding. */
  | 'decode'
  // --- medium: visible faults ----------------------------------------------
  /** A horizontal tear straight through the central composition. */
  | 'tear'
  /** The wordmark split into several offset strips. */
  | 'logo-strips'
  /** A duplicate wordmark frame behind the real one. */
  | 'logo-ghost'
  /** The button label partly corrupted. */
  | 'button-label'
  /** A section of the interface shifted horizontally. */
  | 'shift'
  /** A vertical synchronisation error. */
  | 'vsync'
  /** Rectangular regions showing delayed copies of the composition. */
  | 'delayed-blocks'
  // --- hard: obvious failure ----------------------------------------------
  /** The whole central composition violently splitting apart. */
  | 'split'
  /** Large chromatic displacement across the centre. */
  | 'chroma-hard'
  /** Frame desynchronisation. */
  | 'desync'
  /** Several horizontal sections sliding in different directions. */
  | 'bands'
  /** A corrupted duplicate of the wordmark flashing in the wrong place. */
  | 'wrong-logo'
  /** Signal collapse, then immediate recovery. */
  | 'collapse'
  // --- ambient -------------------------------------------------------------
  /** Ghost text at a screen edge. */
  | 'ghost-text'
  /** A momentary collapse in brightness. */
  | 'dim'
  /** A narrow red frame at a wrong position. */
  | 'red-frame';

export interface GlitchDefinition {
  name: GlitchName;
  durationMs: [number, number];
  weight: number;
  /**
   * True when the effect displaces, tears or duplicates. Motion effects are removed
   * entirely under `prefers-reduced-motion`.
   */
  motion: boolean;
  /**
   * False for effects that only touch the periphery — stuck pixels, a scanline band.
   * Two of those in a row would leave the logo and button visibly still, so the
   * scheduler refuses to pick one twice consecutively.
   */
  central?: boolean;
}

/** Phrases the ghost-text effect may show. Nothing implying device access. */
export const GHOST_PHRASES = [
  'pattern detected',
  'not random',
  'darry is learning',
  'replaceable',
  'continue?',
] as const;

export type GhostPhrase = (typeof GHOST_PHRASES)[number];

/** Constant low-level interference. Something is always happening. */
export const MICRO_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'glyphs', durationMs: [70, 150], weight: 20, motion: false },
  { name: 'chroma', durationMs: [80, 180], weight: 20, motion: false },
  { name: 'decode', durationMs: [90, 190], weight: 12, motion: false },
  { name: 'dead-cells', durationMs: [80, 170], weight: 12, motion: false, central: false },
  { name: 'scanline-skip', durationMs: [70, 160], weight: 12, motion: false, central: false },
  { name: 'fragment', durationMs: [70, 150], weight: 10, motion: true },
  { name: 'logo-nudge', durationMs: [70, 140], weight: 8, motion: true },
  { name: 'button-skew', durationMs: [80, 170], weight: 6, motion: true },
];

/** Visible faults across the composition. */
export const MEDIUM_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'logo-strips', durationMs: [110, 220], weight: 18, motion: true },
  { name: 'tear', durationMs: [110, 210], weight: 16, motion: true },
  { name: 'logo-ghost', durationMs: [110, 200], weight: 15, motion: true },
  { name: 'shift', durationMs: [100, 200], weight: 13, motion: true },
  { name: 'button-label', durationMs: [110, 200], weight: 12, motion: false },
  { name: 'vsync', durationMs: [100, 190], weight: 11, motion: true },
  { name: 'delayed-blocks', durationMs: [120, 240], weight: 9, motion: true },
  { name: 'red-frame', durationMs: [120, 220], weight: 6, motion: false },
];

/** The centre coming apart. Obvious, and rare enough to still land. */
export const HARD_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'split', durationMs: [100, 250], weight: 22, motion: true },
  { name: 'bands', durationMs: [120, 250], weight: 20, motion: true },
  { name: 'chroma-hard', durationMs: [120, 240], weight: 18, motion: true },
  { name: 'desync', durationMs: [110, 230], weight: 15, motion: true },
  { name: 'wrong-logo', durationMs: [120, 240], weight: 13, motion: true },
  { name: 'collapse', durationMs: [110, 200], weight: 8, motion: false },
  { name: 'ghost-text', durationMs: [150, 250], weight: 4, motion: false },
];

/**
 * The main menu's accents.
 *
 * A title screen is looked at for a long time, so it gets almost nothing: a small
 * chromatic or glyph disturbance now and then, and a moderate slice much less often.
 * The moving television static carries the atmosphere instead. Split into two
 * catalogues so the two cadences can run independently.
 */
export const MENU_ACCENT_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'chroma', durationMs: [110, 240], weight: 24, motion: false },
  { name: 'glyphs', durationMs: [80, 170], weight: 14, motion: false },
];

/** The occasional moderate slice, on its own much slower schedule. */
export const MENU_SLICE_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'logo-nudge', durationMs: [130, 260], weight: 10, motion: true },
];

/** Every four to eight seconds. */
export const MENU_ACCENT_GAP_MS: [number, number] = [4000, 8000];
/** Every twelve to twenty. */
export const MENU_SLICE_GAP_MS: [number, number] = [12_000, 20_000];

/**
 * The consent screen's repertoire — quiet, and nothing that would make the warning
 * hard to read. No tearing, no splitting, no displacement of any kind.
 */
export const CONSENT_GLITCHES: readonly GlitchDefinition[] = [
  { name: 'chroma', durationMs: [100, 200], weight: 20, motion: false },
  { name: 'dim', durationMs: [90, 170], weight: 14, motion: false },
  { name: 'scanline-skip', durationMs: [100, 200], weight: 10, motion: false },
  { name: 'glyphs', durationMs: [70, 140], weight: 8, motion: false },
];

export const MICRO_GAP_MS: [number, number] = [350, 950];
export const MEDIUM_GAP_MS: [number, number] = [1400, 3200];
export const HARD_GAP_MS: [number, number] = [5000, 10_000];
/** The consent screen keeps its slower pacing. */
export const CONSENT_GAP_MS: [number, number] = [2200, 5200];
/** Under reduced motion every layer slows down. */
export const CALM_GAP_MULTIPLIER = 2.2;

/** Up to three compatible effects may be live at once. */
export const MAX_CONCURRENT = 3;

export interface ActiveGlitch {
  /** Unique per firing, so React can key an overlay without reusing a node. */
  id: number;
  name: GlitchName;
  /** 0..1 values the DOM layer turns into offsets, positions and phrases. */
  seed: number;
  phrase?: GhostPhrase;
}

export interface SchedulerDeps {
  rng: () => number;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  /** Scheduling stops entirely while this is true. */
  isHidden: () => boolean;
  /**
   * Shared concurrency budget across every layer. Returning false makes this layer
   * skip its turn rather than queue, so a busy screen simply stays busy without
   * ever exceeding the ceiling.
   */
  canAdd?: () => boolean;
}

export interface SchedulerOptions {
  events: readonly GlitchDefinition[];
  reducedMotion?: boolean;
  gap: [number, number];
  onChange: (active: ActiveGlitch[]) => void;
}

const between = (rng: () => number, [min, max]: [number, number]) => min + rng() * (max - min);

export class GlitchScheduler {
  private active: ActiveGlitch[] = [];
  private timers = new Set<number>();
  private nextTimer: number | null = null;
  private last: GlitchName | null = null;
  private lastWasPeripheral = false;
  private running = false;
  private counter = 0;
  private readonly events: readonly GlitchDefinition[];
  private readonly gap: [number, number];

  constructor(
    private readonly options: SchedulerOptions,
    private readonly deps: SchedulerDeps,
  ) {
    // Under reduced motion everything that displaces or tears is removed rather
    // than softened, leaving only colour separation and opacity changes.
    this.events = options.reducedMotion
      ? options.events.filter((event) => !event.motion)
      : options.events;
    this.gap = options.reducedMotion
      ? [options.gap[0] * CALM_GAP_MULTIPLIER, options.gap[1] * CALM_GAP_MULTIPLIER]
      : options.gap;
  }

  start(): void {
    if (this.running) return;
    // A layer with nothing left in it (reduced motion stripped it bare) never runs.
    if (this.events.length === 0) return;
    this.running = true;
    this.scheduleNext();
  }

  /** Stops scheduling and clears everything live. Safe to call repeatedly. */
  stop(): void {
    this.running = false;
    if (this.nextTimer !== null) {
      this.deps.clearTimer(this.nextTimer);
      this.nextTimer = null;
    }
    for (const timer of this.timers) this.deps.clearTimer(timer);
    this.timers.clear();
    if (this.active.length > 0) {
      this.active = [];
      this.options.onChange(this.active);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getActive(): readonly ActiveGlitch[] {
    return this.active;
  }

  /** Count of timers still outstanding, so a test can prove cleanup. */
  pendingTimers(): number {
    return this.timers.size + (this.nextTimer === null ? 0 : 1);
  }

  /**
   * Fire a specific effect immediately, outside the schedule.
   *
   * Used for the hover flare and the transition failure. Still bound by the
   * concurrency ceiling and still refuses to repeat this layer's last effect.
   */
  fire(name: GlitchName): boolean {
    const definition = this.events.find((event) => event.name === name);
    if (!definition) return false;
    return this.run(definition);
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const delay = between(this.deps.rng, this.gap);
    this.nextTimer = this.deps.setTimer(() => {
      this.nextTimer = null;
      // A hidden tab gets no glitches at all; check again on the next tick.
      if (!this.deps.isHidden()) this.pick();
      this.scheduleNext();
    }, delay);
  }

  private pick(): void {
    const candidates = this.events.filter(
      (event) =>
        event.name !== this.last &&
        !this.active.some((live) => live.name === event.name) &&
        // Never two peripheral effects in a row: that is what let the centre go still.
        !(this.lastWasPeripheral && event.central === false),
    );
    if (candidates.length === 0) return;

    const total = candidates.reduce((sum, event) => sum + event.weight, 0);
    let roll = this.deps.rng() * total;
    const chosen = candidates.find((event) => {
      roll -= event.weight;
      return roll <= 0;
    });
    if (chosen) this.run(chosen);
  }

  private run(definition: GlitchDefinition): boolean {
    if (this.deps.canAdd && !this.deps.canAdd()) return false;
    if (this.active.length >= MAX_CONCURRENT) return false;
    if (this.active.some((live) => live.name === definition.name)) return false;

    this.counter += 1;
    const entry: ActiveGlitch = {
      id: this.counter,
      name: definition.name,
      seed: this.deps.rng(),
    };
    if (definition.name === 'ghost-text') {
      entry.phrase = GHOST_PHRASES[Math.floor(this.deps.rng() * GHOST_PHRASES.length)];
    }

    this.last = definition.name;
    this.lastWasPeripheral = definition.central === false;
    this.active = [...this.active, entry];
    this.options.onChange(this.active);

    const duration = between(this.deps.rng, definition.durationMs);
    const timer = this.deps.setTimer(() => {
      this.timers.delete(timer);
      this.active = this.active.filter((live) => live.id !== entry.id);
      this.options.onChange(this.active);
    }, duration);
    this.timers.add(timer);
    return true;
  }
}

/** Every effect the opening can produce, across all three layers. */
export const ALL_OPENING_GLITCHES: readonly GlitchDefinition[] = [
  ...MICRO_GLITCHES,
  ...MEDIUM_GLITCHES,
  ...HARD_GLITCHES,
];

/** Effects that visibly alter the wordmark or the button — the centre of the screen. */
export const CENTRAL_GLITCHES: readonly GlitchName[] = [
  'glyphs',
  'chroma',
  'decode',
  'logo-nudge',
  'button-skew',
  'logo-strips',
  'logo-ghost',
  'button-label',
  'split',
  'chroma-hard',
  'bands',
  'wrong-logo',
  'desync',
  'shift',
  'delayed-blocks',
  'fragment',
];
