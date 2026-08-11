'use client';

/**
 * Client-only values, read from external stores rather than mirrored into state.
 *
 * Both of the things here — the motion preference and a seeded random pattern —
 * exist only in the browser. Copying them into component state with an effect
 * causes a cascading render on every mount and puts `setState` in an effect body;
 * `useSyncExternalStore` reads them at the source instead, and its server snapshot
 * keeps the first paint identical to the server so hydration cannot mismatch.
 */

import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Motion preference
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function motionSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** True when the visitor has asked for reduced motion. False during SSR. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
}

// ---------------------------------------------------------------------------
// Seeded client-only patterns
// ---------------------------------------------------------------------------

/*
 * Generated values are cached by key so `getSnapshot` returns a stable reference —
 * returning a fresh object each call would make React re-render forever. The cache
 * is also what makes a given seed produce the same pattern for the whole session.
 */
const patternCache = new Map<string, unknown>();

function subscribeNever(): () => void {
  return () => {};
}

/**
 * Build a random pattern once, on the client only.
 *
 * Renders as `null` on the server and on the very first client paint, then resolves
 * to the generated value — so `Math.random` is never called during server rendering
 * and there is nothing for hydration to disagree about.
 */
export function useSeededPattern<T>(key: string, build: () => T): T | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      if (!patternCache.has(key)) patternCache.set(key, build());
      return patternCache.get(key) as T;
    },
    () => null,
  );
}

/** Test seam. */
export function __clearPatternCache(): void {
  patternCache.clear();
}
