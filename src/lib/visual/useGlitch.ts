'use client';

/**
 * React access to the glitch scheduler.
 *
 * Runs any number of independent layers and merges their live effects into one
 * view, arbitrating a shared concurrency ceiling between them so three layers
 * cannot between them exceed the cap.
 *
 * All randomness lives inside effects, never in render, so the server and the first
 * client paint agree and there is no hydration mismatch.
 *
 * Scheduling pauses whenever the tab is hidden and resumes when it comes back.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mulberry32 } from '@/lib/behavior/rng';
import { useReducedMotion } from './clientOnly';
import {
  CONSENT_GAP_MS,
  CONSENT_GLITCHES,
  GlitchScheduler,
  HARD_GAP_MS,
  HARD_GLITCHES,
  MAX_CONCURRENT,
  MEDIUM_GAP_MS,
  MENU_ACCENT_GAP_MS,
  MENU_ACCENT_GLITCHES,
  MENU_SLICE_GAP_MS,
  MENU_SLICE_GLITCHES,
  MEDIUM_GLITCHES,
  MICRO_GAP_MS,
  MICRO_GLITCHES,
  type ActiveGlitch,
  type GlitchDefinition,
  type GlitchName,
} from './glitchScheduler';

export interface GlitchLayer {
  id: string;
  events: readonly GlitchDefinition[];
  gap: [number, number];
}

/** The opening: constant interference, visible faults, and occasional collapse. */
export const OPENING_LAYERS: readonly GlitchLayer[] = [
  { id: 'micro', events: MICRO_GLITCHES, gap: MICRO_GAP_MS },
  { id: 'medium', events: MEDIUM_GLITCHES, gap: MEDIUM_GAP_MS },
  { id: 'hard', events: HARD_GLITCHES, gap: HARD_GAP_MS },
];

/** The consent screen: one quiet layer. */
export const CONSENT_LAYERS: readonly GlitchLayer[] = [
  { id: 'consent', events: CONSENT_GLITCHES, gap: CONSENT_GAP_MS },
];

/**
 * The main menu: occasional accents only.
 *
 * Two slow layers rather than the opening's three fast ones. The title screen's
 * continuous movement comes from the television static, so the glitches are punctuation.
 */
export const MENU_ACCENT_LAYERS: readonly GlitchLayer[] = [
  { id: 'menu-accent', events: MENU_ACCENT_GLITCHES, gap: MENU_ACCENT_GAP_MS },
  { id: 'menu-slice', events: MENU_SLICE_GLITCHES, gap: MENU_SLICE_GAP_MS },
];

export interface UseGlitchOptions {
  layers: readonly GlitchLayer[];
  /** Seeded mode for tests and screenshot capture. Null means system randomness. */
  seed?: number | null;
  enabled?: boolean;
}

export interface GlitchState {
  active: readonly ActiveGlitch[];
  has: (name: GlitchName) => boolean;
  get: (name: GlitchName) => ActiveGlitch | undefined;
  /** Fire an effect outside the schedule. Returns false if it was refused. */
  fire: (name: GlitchName) => boolean;
  reducedMotion: boolean;
}

export function useGlitch({ layers, seed = null, enabled = true }: UseGlitchOptions): GlitchState {
  const [active, setActive] = useState<readonly ActiveGlitch[]>([]);
  const reducedMotion = useReducedMotion();
  const schedulersRef = useRef<GlitchScheduler[]>([]);
  /** Per-layer live effects, so the shared budget can be computed synchronously. */
  const perLayer = useRef<Map<string, ActiveGlitch[]>>(new Map());

  const layerKey = useMemo(
    () => layers.map((layer) => `${layer.id}:${layer.gap.join('-')}`).join('|'),
    [layers],
  );

  useEffect(() => {
    if (!enabled) return;

    const buckets = perLayer.current;
    buckets.clear();

    const merge = () => {
      const merged: ActiveGlitch[] = [];
      for (const layer of layers) merged.push(...(buckets.get(layer.id) ?? []));
      setActive(merged);
    };

    const totalLive = () => {
      let total = 0;
      for (const entries of buckets.values()) total += entries.length;
      return total;
    };

    const schedulers = layers.map((layer, index) => {
      // Each layer gets its own stream from the same seed, so the whole screen is
      // reproducible but the layers are not in lockstep.
      const rng = seed === null ? Math.random : mulberry32(seed + index * 7919 + 13);
      return new GlitchScheduler(
        {
          events: layer.events,
          gap: layer.gap,
          reducedMotion,
          onChange: (next) => {
            buckets.set(layer.id, next);
            merge();
          },
        },
        {
          rng,
          setTimer: (fn, ms) => window.setTimeout(fn, ms),
          clearTimer: (id) => window.clearTimeout(id),
          isHidden: () => typeof document !== 'undefined' && document.hidden,
          canAdd: () => totalLive() < MAX_CONCURRENT,
        },
      );
    });

    schedulersRef.current = schedulers;
    schedulers.forEach((scheduler) => scheduler.start());

    const onVisibility = () => {
      if (document.hidden) schedulers.forEach((scheduler) => scheduler.stop());
      else schedulers.forEach((scheduler) => scheduler.start());
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      schedulers.forEach((scheduler) => scheduler.stop());
      schedulersRef.current = [];
      buckets.clear();
    };
    // `layerKey` stands in for the layers array so a fresh literal does not restart
    // every scheduler on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, seed, reducedMotion, layerKey]);

  const has = useCallback((name: GlitchName) => active.some((live) => live.name === name), [active]);
  const get = useCallback((name: GlitchName) => active.find((live) => live.name === name), [active]);

  /** Offered to whichever layer owns the effect. */
  const fire = useCallback((name: GlitchName) => {
    for (const scheduler of schedulersRef.current) {
      if (scheduler.fire(name)) return true;
    }
    return false;
  }, []);

  return { active, has, get, fire, reducedMotion };
}

/** Read the screenshot/test seed, gated behind the same flag as the game's. */
export function glitchSeedFromLocation(): number | null {
  if (process.env.NEXT_PUBLIC_ALLOW_SEED !== 'true') return null;
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}
