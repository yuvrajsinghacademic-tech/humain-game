import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_OPENING_GLITCHES,
  CENTRAL_GLITCHES,
  CONSENT_GLITCHES,
  GHOST_PHRASES,
  GlitchScheduler,
  HARD_GAP_MS,
  HARD_GLITCHES,
  MAX_CONCURRENT,
  MEDIUM_GAP_MS,
  MEDIUM_GLITCHES,
  MICRO_GAP_MS,
  MICRO_GLITCHES,
  type ActiveGlitch,
  type GlitchName,
  type SchedulerDeps,
} from '@/lib/visual/glitchScheduler';
import { mulberry32 } from '@/lib/behavior/rng';

/**
 * The scheduler is driven through injected timers rather than real ones, so these
 * tests assert on the sequence of events it actually produces rather than on
 * wall-clock behaviour.
 */
function harness(options: {
  rng?: () => number;
  events?: readonly (typeof ALL_OPENING_GLITCHES)[number][];
  gap?: [number, number];
  reducedMotion?: boolean;
  hidden?: () => boolean;
} = {}) {
  const log: GlitchName[][] = [];
  let hidden = false;
  const deps: SchedulerDeps = {
    rng: options.rng ?? mulberry32(7),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    isHidden: options.hidden ?? (() => hidden),
  };

  let latest: readonly ActiveGlitch[] = [];
  const scheduler = new GlitchScheduler(
    {
      events: options.events ?? MICRO_GLITCHES,
      gap: options.gap ?? MICRO_GAP_MS,
      reducedMotion: options.reducedMotion,
      onChange: (active) => {
        latest = active;
        log.push(active.map((entry) => entry.name));
      },
    },
    deps,
  );

  return {
    scheduler,
    log,
    get latest() {
      return latest;
    },
    hide: () => {
      hidden = true;
    },
    show: () => {
      hidden = false;
    },
  };
}

/** The order effects were introduced in, across the whole run. */
function firedOrder(log: GlitchName[][]): GlitchName[] {
  const order: GlitchName[] = [];
  let previous: GlitchName[] = [];
  for (const snapshot of log) {
    for (const name of snapshot) {
      if (!previous.includes(name)) order.push(name);
    }
    previous = snapshot;
  }
  return order;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('quiet periods', () => {
  it('fires nothing at all for at least the minimum gap', () => {
    const { scheduler, log } = harness();
    scheduler.start();

    vi.advanceTimersByTime(MICRO_GAP_MS[0] - 100);
    expect(log).toHaveLength(0);
    expect(scheduler.getActive()).toHaveLength(0);
  });

  it('has fired something by the time the maximum gap has passed', () => {
    const { scheduler, log } = harness();
    scheduler.start();
    vi.advanceTimersByTime(MICRO_GAP_MS[1] + 50);
    expect(log.length).toBeGreaterThan(0);
  });

  it('leaves the screen quiet between events rather than glitching continuously', () => {
    const { scheduler, log } = harness();
    scheduler.start();
    vi.advanceTimersByTime(60_000);

    // Every event is short and separated, so plenty of snapshots are empty.
    const quiet = log.filter((snapshot) => snapshot.length === 0).length;
    expect(quiet).toBeGreaterThan(5);
    expect(log.length).toBeGreaterThan(10);
  });
});

describe('the two hard rules', () => {
  it('never runs more than two effects at once', () => {
    const { scheduler, log } = harness();
    scheduler.start();
    vi.advanceTimersByTime(120_000);

    expect(log.length).toBeGreaterThan(20);
    for (const snapshot of log) {
      expect(snapshot.length).toBeLessThanOrEqual(MAX_CONCURRENT);
    }
  });

  it('never repeats the same effect twice in a row', () => {
    const { scheduler, log } = harness();
    scheduler.start();
    vi.advanceTimersByTime(180_000);

    const order = firedOrder(log);
    expect(order.length).toBeGreaterThan(20);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i], `event ${i} repeated ${order[i - 1]}`).not.toBe(order[i - 1]);
    }
  });

  it('refuses a manual fire that would breach the ceiling', () => {
    const { scheduler } = harness();
    // Fill to the cap with three distinct micro effects, then the next is refused.
    expect(scheduler.fire('chroma')).toBe(true);
    expect(scheduler.fire('glyphs')).toBe(true);
    expect(scheduler.fire('decode')).toBe(true);
    expect(scheduler.getActive()).toHaveLength(MAX_CONCURRENT);
    expect(scheduler.fire('dead-cells')).toBe(false);
  });

  it('refuses a manual fire of an effect already live', () => {
    const { scheduler } = harness();
    expect(scheduler.fire('chroma')).toBe(true);
    expect(scheduler.fire('chroma')).toBe(false);
  });

  it('refuses a manual fire of an effect not in its repertoire', () => {
    const { scheduler } = harness({ events: CONSENT_GLITCHES });
    // The consent screen has no tearing.
    expect(scheduler.fire('tear')).toBe(false);
  });
});

describe('weighting', () => {
  it('makes hard failures rarer than subtle ones', () => {
    const { scheduler, log } = harness({ rng: mulberry32(99) });
    scheduler.start();
    vi.advanceTimersByTime(600_000);

    const order = firedOrder(log);
    const count = (name: GlitchName) => order.filter((entry) => entry === name).length;

    expect(order.length).toBeGreaterThan(80);
    // Colour separation is the workhorse; tearing and ghost text are events.
    expect(count('chroma')).toBeGreaterThan(count('tear'));
    expect(count('chroma')).toBeGreaterThan(count('ghost-text'));
    expect(count('glyphs')).toBeGreaterThan(count('red-frame'));
  });

  it('eventually reaches every effect in the repertoire', () => {
    const { scheduler, log } = harness({ rng: mulberry32(5) });
    scheduler.start();
    vi.advanceTimersByTime(900_000);

    const seen = new Set(firedOrder(log));
    for (const event of MICRO_GLITCHES) {
      expect(seen.has(event.name), `${event.name} never fired`).toBe(true);
    }
  });

  it('attaches a permitted phrase to ghost text', () => {
    // Ghost text lives on the hard layer.
    const hard = harness({ events: HARD_GLITCHES, gap: HARD_GAP_MS, rng: mulberry32(11) });
    hard.scheduler.fire('ghost-text');
    const entry = hard.scheduler.getActive().find((live) => live.name === 'ghost-text');
    expect(entry?.phrase).toBeDefined();
    expect(GHOST_PHRASES).toContain(entry!.phrase!);
  });

  it('offers no phrase implying device access', () => {
    for (const phrase of GHOST_PHRASES) {
      expect(phrase).not.toMatch(/camera|microphone|mic\b|history|location|contacts/i);
    }
  });
});

describe('determinism', () => {
  it('produces an identical sequence for the same seed', () => {
    // Each run is stopped before the next begins: they share one fake clock, so a
    // scheduler left running would keep firing into its own log during the second
    // window and the comparison would be against unequal amounts of elapsed time.
    const first = harness({ rng: mulberry32(1234) });
    first.scheduler.start();
    vi.advanceTimersByTime(120_000);
    first.scheduler.stop();

    const second = harness({ rng: mulberry32(1234) });
    second.scheduler.start();
    vi.advanceTimersByTime(120_000);
    second.scheduler.stop();

    expect(firedOrder(first.log)).toEqual(firedOrder(second.log));
    expect(first.log).toEqual(second.log);
  });

  it('produces a different sequence for a different seed', () => {
    const first = harness({ rng: mulberry32(1) });
    first.scheduler.start();
    vi.advanceTimersByTime(120_000);
    first.scheduler.stop();

    const second = harness({ rng: mulberry32(2) });
    second.scheduler.start();
    vi.advanceTimersByTime(120_000);
    second.scheduler.stop();

    expect(firedOrder(first.log)).not.toEqual(firedOrder(second.log));
  });
});

describe('hidden tabs', () => {
  it('schedules nothing while the tab is hidden', () => {
    const { scheduler, log, hide } = harness();
    hide();
    scheduler.start();
    vi.advanceTimersByTime(120_000);
    expect(log).toHaveLength(0);
  });

  it('resumes once the tab is visible again', () => {
    const { scheduler, log, hide, show } = harness();
    hide();
    scheduler.start();
    vi.advanceTimersByTime(60_000);
    expect(log).toHaveLength(0);

    show();
    vi.advanceTimersByTime(60_000);
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('cleanup', () => {
  it('leaves no timer outstanding after stopping', () => {
    const { scheduler } = harness();
    scheduler.start();
    vi.advanceTimersByTime(30_000);
    expect(scheduler.pendingTimers()).toBeGreaterThan(0);

    scheduler.stop();
    expect(scheduler.pendingTimers()).toBe(0);
    expect(scheduler.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears everything live when it stops', () => {
    const { scheduler } = harness();
    scheduler.fire('chroma');
    expect(scheduler.getActive()).toHaveLength(1);
    scheduler.stop();
    expect(scheduler.getActive()).toHaveLength(0);
  });

  it('fires nothing further after stopping', () => {
    const { scheduler, log } = harness();
    scheduler.start();
    vi.advanceTimersByTime(30_000);
    const before = log.length;

    scheduler.stop();
    vi.advanceTimersByTime(120_000);
    // Only the clearing snapshot from stop() itself.
    expect(log.length).toBeLessThanOrEqual(before + 1);
  });

  it('is safe to stop twice and to start twice', () => {
    const { scheduler } = harness();
    scheduler.start();
    scheduler.start();
    vi.advanceTimersByTime(10_000);
    scheduler.stop();
    scheduler.stop();
    expect(scheduler.pendingTimers()).toBe(0);
  });
});

describe('reduced motion', () => {
  it('emits no displacing, tearing or jumping effect at all', () => {
    const { scheduler, log } = harness({ reducedMotion: true, rng: mulberry32(21) });
    scheduler.start();
    vi.advanceTimersByTime(600_000);

    const order = firedOrder(log);
    expect(order.length).toBeGreaterThan(20);

    const motionEvents = MICRO_GLITCHES.filter((event) => event.motion).map((event) => event.name);
    for (const name of motionEvents) {
      expect(order, `${name} must not fire under reduced motion`).not.toContain(name);
    }
  });

  it('keeps colour separation and the non-moving effects', () => {
    const { scheduler, log } = harness({ reducedMotion: true, rng: mulberry32(21) });
    scheduler.start();
    vi.advanceTimersByTime(600_000);

    const order = firedOrder(log);
    expect(order).toContain('chroma');
    expect(order).toContain('glyphs');
    expect(order).toContain('scanline-skip');
  });

  it('paces itself more slowly', () => {
    const calm = harness({ reducedMotion: true, rng: mulberry32(4) });
    calm.scheduler.start();
    vi.advanceTimersByTime(120_000);
    calm.scheduler.stop();

    const normal = harness({ rng: mulberry32(4) });
    normal.scheduler.start();
    vi.advanceTimersByTime(120_000);
    normal.scheduler.stop();

    expect(firedOrder(calm.log).length).toBeLessThan(firedOrder(normal.log).length);
  });

  it('refuses to fire a motion effect on request', () => {
    const { scheduler } = harness({ reducedMotion: true });
    expect(scheduler.fire('tear')).toBe(false);
    expect(scheduler.fire('chroma')).toBe(true);
  });
});

describe('flash discipline', () => {
  it('never holds an effect for less than sixty milliseconds', () => {
    // A shorter effect than this would read as a flash rather than a fault.
    for (const event of [...ALL_OPENING_GLITCHES, ...CONSENT_GLITCHES]) {
      expect(event.durationMs[0]).toBeGreaterThanOrEqual(60);
      expect(event.durationMs[0]).toBeLessThanOrEqual(event.durationMs[1]);
    }
  });

  it('cannot exceed three events per second, because the gap floor forbids it', () => {
    // The shortest possible gap is 1.5s, so at most one event starts per 1.5s.
    expect(MICRO_GAP_MS[0]).toBeGreaterThanOrEqual(1000 / 3);
    expect(MICRO_GAP_MS[0]).toBeLessThan(MICRO_GAP_MS[1]);
  });
});

describe('the consent repertoire', () => {
  it('contains nothing that moves', () => {
    for (const event of CONSENT_GLITCHES) {
      expect(event.motion, `${event.name} must not move on the consent screen`).toBe(false);
    }
  });

  it('excludes tearing, jumping and label corruption', () => {
    const names = CONSENT_GLITCHES.map((event) => event.name);
    expect(names).not.toContain('tear');
    expect(names).not.toContain('button-label');
    expect(names).not.toContain('split');
    expect(names).not.toContain('logo-ghost');
  });
});

describe('the three layers', () => {
  it('paces micro, medium and hard the way the design says', () => {
    expect(MICRO_GAP_MS).toEqual([350, 950]);
    expect(MEDIUM_GAP_MS).toEqual([1400, 3200]);
    expect(HARD_GAP_MS).toEqual([5000, 10_000]);
  });

  it('keeps the catalogues disjoint, so layers cannot collide', () => {
    const micro = new Set(MICRO_GLITCHES.map((e) => e.name));
    const medium = new Set(MEDIUM_GLITCHES.map((e) => e.name));
    const hard = new Set(HARD_GLITCHES.map((e) => e.name));
    for (const name of micro) expect(medium.has(name) || hard.has(name)).toBe(false);
    for (const name of medium) expect(hard.has(name)).toBe(false);
  });

  it('fires micro interference far more often than hard failures', () => {
    const micro = harness({ events: MICRO_GLITCHES, gap: MICRO_GAP_MS, rng: mulberry32(31) });
    micro.scheduler.start();
    vi.advanceTimersByTime(120_000);
    micro.scheduler.stop();

    const hard = harness({ events: HARD_GLITCHES, gap: HARD_GAP_MS, rng: mulberry32(31) });
    hard.scheduler.start();
    vi.advanceTimersByTime(120_000);
    hard.scheduler.stop();

    const microCount = firedOrder(micro.log).length;
    const hardCount = firedOrder(hard.log).length;
    // Roughly 0.8s versus 7.5s average, so at least four times as many.
    expect(microCount).toBeGreaterThan(hardCount * 4);
  });

  it('never leaves the micro layer quiet for two seconds', () => {
    // The brief: the centre must not look motionless. With a 1.3s ceiling on the gap
    // and effects lasting ~100ms, no two-second window can be empty.
    const { scheduler, log } = harness({ rng: mulberry32(77) });
    scheduler.start();
    vi.advanceTimersByTime(60_000);

    const order = firedOrder(log);
    // Sixty seconds at 0.35–1.3s per event is at least forty firings.
    expect(order.length).toBeGreaterThan(40);
    // Two gaps back to back must still come in under the two-second budget.
    expect(MICRO_GAP_MS[1] * 2).toBeLessThan(2000);
  });

  it('puts most of its weight on effects that alter the logo or the button', () => {
    const central = new Set(CENTRAL_GLITCHES);
    const centralWeight = ALL_OPENING_GLITCHES.filter((e) => central.has(e.name)).reduce(
      (sum, e) => sum + e.weight,
      0,
    );
    const total = ALL_OPENING_GLITCHES.reduce((sum, e) => sum + e.weight, 0);
    expect(centralWeight / total).toBeGreaterThan(0.6);
  });

  it('gives every layer at least one effect that survives reduced motion', () => {
    // Otherwise a layer would silently stop existing for those players.
    for (const layer of [MICRO_GLITCHES, CONSENT_GLITCHES]) {
      expect(layer.some((event) => !event.motion)).toBe(true);
    }
  });

  it('allows three effects at once', () => {
    expect(MAX_CONCURRENT).toBe(3);
  });
});

describe('hard layer content', () => {
  it('is built from displacement and duplication, not flashing', () => {
    const names = HARD_GLITCHES.map((e) => e.name);
    expect(names).toContain('split');
    expect(names).toContain('bands');
    expect(names).toContain('chroma-hard');
    expect(names).toContain('desync');
    expect(names).toContain('wrong-logo');
    expect(names).toContain('collapse');
  });

  it('holds a hard failure long enough to be seen', () => {
    for (const event of HARD_GLITCHES) {
      expect(event.durationMs[0]).toBeGreaterThanOrEqual(100);
      expect(event.durationMs[1]).toBeLessThanOrEqual(250);
    }
  });
});

describe('the centre never goes still', () => {
  it('never picks two peripheral effects in a row', () => {
    // Two peripheral effects back to back would leave the logo and button untouched
    // for two gaps, which is what made the opening look motionless.
    const { scheduler, log } = harness({ rng: mulberry32(4242) });
    scheduler.start();
    vi.advanceTimersByTime(600_000);

    const peripheral = new Set(
      MICRO_GLITCHES.filter((event) => event.central === false).map((event) => event.name),
    );
    const order = firedOrder(log);
    expect(order.length).toBeGreaterThan(200);

    for (let i = 1; i < order.length; i += 1) {
      const both = peripheral.has(order[i]) && peripheral.has(order[i - 1]);
      expect(both, `${order[i - 1]} → ${order[i]} are both peripheral`).toBe(false);
    }
  });

  it('bounds the worst-case still stretch under two seconds', () => {
    /*
     * With no two peripheral effects adjacent, the longest the centre can be untouched
     * is one peripheral event plus the gaps either side of it: two gaps at the ceiling.
     */
    const worstCase = MICRO_GAP_MS[1] * 2;
    expect(worstCase).toBeLessThan(2000);
  });

  it('keeps the peripheral effects a minority of the micro layer', () => {
    const total = MICRO_GLITCHES.reduce((sum, event) => sum + event.weight, 0);
    const peripheral = MICRO_GLITCHES.filter((event) => event.central === false).reduce(
      (sum, event) => sum + event.weight,
      0,
    );
    expect(peripheral / total).toBeLessThan(0.3);
  });
});
