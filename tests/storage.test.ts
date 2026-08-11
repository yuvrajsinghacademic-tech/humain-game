import { describe, expect, it } from 'vitest';
import {
  AUDIO_PREFERENCE_KEY,
  RETIRED_KEYS,
  isBehaviouralKey,
  purgeRetiredProfiles,
} from '@/lib/storage';

/**
 * The storage policy is now "almost nothing". These tests guard the two things
 * that matter: the previous release's persisted profiles are removed rather than
 * loaded, and nothing behavioural is ever written again.
 */

function fakeStorage(options: { failWrites?: boolean; failReads?: boolean } = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => {
      if (options.failReads) throw new Error('read blocked');
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.failWrites) throw new Error('quota exceeded');
      map.set(key, value);
    },
    removeItem: (key: string) => {
      if (options.failWrites) throw new Error('remove blocked');
      map.delete(key);
    },
  } as Storage;
}

describe('retiring the previous storage schema', () => {
  it('removes a remembered profile left by the old version', () => {
    const store = fakeStorage();
    store.setItem(
      'humain.v2',
      JSON.stringify({ version: 2, remembered: true, profile: { version: 2 }, aggregates: [] }),
    );

    const result = purgeRetiredProfiles(store);

    expect(result.removed).toContain('humain.v2');
    expect(result.complete).toBe(true);
    expect(store.getItem('humain.v2')).toBeNull();
  });

  it('removes every retired key, including the older one and the write probe', () => {
    const store = fakeStorage();
    for (const key of RETIRED_KEYS) store.setItem(key, '{}');

    const result = purgeRetiredProfiles(store);

    expect(result.removed.sort()).toEqual([...RETIRED_KEYS].sort());
    for (const key of RETIRED_KEYS) expect(store.getItem(key)).toBeNull();
  });

  it('leaves the audio preference alone — it is a UI setting, not behaviour', () => {
    const store = fakeStorage();
    store.setItem(AUDIO_PREFERENCE_KEY, 'false');
    store.setItem('humain.v2', '{}');

    purgeRetiredProfiles(store);

    expect(store.getItem(AUDIO_PREFERENCE_KEY)).toBe('false');
  });

  it('reports nothing removed on a clean device', () => {
    const result = purgeRetiredProfiles(fakeStorage());
    expect(result.removed).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it('survives storage being absent', () => {
    expect(purgeRetiredProfiles(null).complete).toBe(true);
    expect(purgeRetiredProfiles(undefined).removed).toEqual([]);
  });

  it('survives a store that refuses reads', () => {
    const result = purgeRetiredProfiles(fakeStorage({ failReads: true }));
    expect(result.removed).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it('reports an incomplete purge honestly when removal is refused', () => {
    const store = fakeStorage();
    store.setItem('humain.v2', '{}');
    const blocked: Storage = {
      ...store,
      getItem: (key: string) => store.getItem(key),
      removeItem: () => {
        throw new Error('nope');
      },
    } as Storage;

    const result = purgeRetiredProfiles(blocked);
    expect(result.complete).toBe(false);
    expect(result.removed).toEqual([]);
  });
});

describe('what counts as behavioural storage', () => {
  it('treats every humain key except the audio preference as behavioural', () => {
    expect(isBehaviouralKey('humain.v2')).toBe(true);
    expect(isBehaviouralKey('humain.profile')).toBe(true);
    expect(isBehaviouralKey(AUDIO_PREFERENCE_KEY)).toBe(false);
    expect(isBehaviouralKey('unrelated.key')).toBe(false);
  });
});

describe('no persistence path remains', () => {
  it('exports no writer for behavioural data', async () => {
    // A regression guard: if a save/remember helper is ever reintroduced here, this
    // fails and forces a deliberate decision rather than a quiet re-persist.
    const storage = await import('@/lib/storage');
    const exported = Object.keys(storage);
    for (const name of exported) {
      expect(name).not.toMatch(/save|remember|persist|write/i);
    }
    expect(exported.sort()).toEqual(
      [
        'AUDIO_PREFERENCE_KEY',
        'RETIRED_KEYS',
        'isBehaviouralKey',
        'purgeRetiredProfiles',
        'purgeRetiredProfilesFromWindow',
      ].sort(),
    );
  });
});
