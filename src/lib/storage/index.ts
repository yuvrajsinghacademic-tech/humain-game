/**
 * On-device storage — deliberately almost nothing.
 *
 * The behavioural profile is no longer persisted. It lives in React state for the
 * lifetime of the tab, so Darry keeps learning across `play again` and forgets
 * everything on refresh. That is the whole storage policy.
 *
 * Two things remain:
 *  - a purge for the profiles written by the previous release, so an old record
 *    is never silently loaded into the new experience;
 *  - the audio mute preference, which is a UI setting rather than behavioural data
 *    and is owned by the audio engine.
 */

/** Keys written by earlier releases. Removed on boot, never read. */
export const RETIRED_KEYS = ['humain.v2', 'humain.v1', 'humain.probe'] as const;

/** The one key the game still writes. Not behavioural data. */
export const AUDIO_PREFERENCE_KEY = 'humain.audio.muted';

export interface PurgeResult {
  /** Keys that were present and have been removed. */
  removed: string[];
  /** False when the browser refused to let us remove something. */
  complete: boolean;
}

/**
 * Delete every behavioural record the previous version left behind.
 *
 * Safe against storage being absent, throwing on read, or throwing on write —
 * all of which happen in private modes and locked-down webviews.
 */
export function purgeRetiredProfiles(store: Storage | undefined | null): PurgeResult {
  if (!store) return { removed: [], complete: true };

  const removed: string[] = [];
  let complete = true;

  for (const key of RETIRED_KEYS) {
    let present = false;
    try {
      present = store.getItem(key) !== null;
    } catch {
      // Cannot even read: nothing we can do, and nothing was readable anyway.
      complete = false;
      continue;
    }
    if (!present) continue;

    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      complete = false;
    }
  }

  return { removed, complete };
}

/** Convenience wrapper for the browser. A no-op during server rendering. */
export function purgeRetiredProfilesFromWindow(): PurgeResult {
  if (typeof window === 'undefined') return { removed: [], complete: true };
  try {
    return purgeRetiredProfiles(window.localStorage);
  } catch {
    return { removed: [], complete: false };
  }
}

/**
 * True when a key holds behavioural data this version must never write.
 * Used by a test that guards against the persistence creeping back in.
 */
export function isBehaviouralKey(key: string): boolean {
  return key.startsWith('humain.') && key !== AUDIO_PREFERENCE_KEY;
}
