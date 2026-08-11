'use client';

/**
 * React access to the audio controller.
 *
 * The controller is a module singleton, so this hook only reads it — it never owns or
 * recreates it. That is what keeps a Strict Mode double mount from starting a second
 * copy of the static over the first.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { getAudio, type AudioSnapshot } from './track';

const subscribe = (onChange: () => void) => getAudio().subscribe(onChange);

/*
 * `useSyncExternalStore` requires a stable snapshot reference, so the controller's
 * object is cached and only replaced when something actually changed. Returning a
 * fresh object per call would re-render forever.
 */
let cached: AudioSnapshot | null = null;
let cachedKey = '';

function getSnapshot(): AudioSnapshot {
  const next = getAudio().getSnapshot();
  const key = [
    next.unlocked,
    next.muted,
    next.mode,
    next.gain.toFixed(3),
    next.fading,
    next.playing,
  ].join('|');
  if (key !== cachedKey || cached === null) {
    cachedKey = key;
    cached = next;
  }
  return cached;
}

const SERVER_SNAPSHOT: AudioSnapshot = {
  unlocked: false,
  muted: false,
  mode: 'silent',
  gain: 0,
  fading: false,
  playing: false,
};

export function useAudio(): AudioSnapshot {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  /*
   * A hidden tab gets paused, and playback resumes when it comes back — but only if
   * the current mode is one that should be heard. Registered once at the app root
   * rather than per screen.
   */
  useEffect(() => {
    const onVisibility = () => {
      const audio = getAudio();
      if (document.hidden) audio.suspend();
      else audio.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return snapshot;
}

export { getAudio };
