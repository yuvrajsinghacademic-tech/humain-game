import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Type-only: erased at compile time, so it cannot load the module before `vi.mock`.
import type { CounterStore } from '@/lib/security/counters';

/**
 * The money gate.
 *
 * One property, asserted four ways: if the durable counter store cannot answer,
 * **no OpenAI request is attempted**. Redis missing, unreachable, erroring, or hanging
 * are all the same answer — refuse to spend, keep the game playable on the local
 * engine.
 *
 * The proof is a spy wrapped around the SDK call itself rather than around our own
 * wrapper, so it cannot be satisfied by a refactor that reaches the network another
 * way: the assertion is `parse` was called zero times.
 */

const parseSpy = vi.fn();

vi.mock('openai', () => {
  class FakeOpenAI {
    responses = {
      parse: (...args: unknown[]) => {
        parseSpy(...args);
        // A spy that resolves normally: if anything did get through, the test fails on
        // the call count rather than on an exception that could be mistaken for the
        // fallback path working correctly.
        return Promise.resolve({
          output_parsed: { prediction: 'A', confidence: 0.9, explanation: 'spy' },
        });
      },
    };
  }
  return { default: FakeOpenAI };
});

const { generateDebrief, generateInterpretation, generatePrediction } = await import('@/lib/ai');
const { __resetOpenAIForTests } = await import('@/lib/ai/client');
const { authorizeAiCall } = await import('@/lib/security/ratelimit');
const { __setCounterStoreForTests, createMemoryStore } = await import('@/lib/security/counters');

/** A configured-looking production server: real key, real Redis credentials. */
function productionWithRedis() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
  vi.stubEnv('MOCK_AI', '');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token-not-real');
}

const PROFILE = {
  winStay: 0.6,
  loseSwitch: 0.5,
  alternation: 0.4,
  exploration: 0.3,
  risk: 0.5,
  sideBias: 0.5,
  recency: 0.5,
  reactance: 0.4,
  consistency: 0.6,
  winStreakStay: 0.6,
  lossStreakSwitch: 0.5,
  meanMs: 900,
  switchMs: 950,
  repeatMs: 870,
  hesitationMs: 80,
  trials: 24,
  evidence: 0.8,
};

const DRIFT = {
  firstHalfSwitchRate: 0.4,
  secondHalfSwitchRate: 0.5,
  firstHalfAccuracy: 0.5,
  secondHalfAccuracy: 0.6,
  meanMsFirstHalf: 900,
  meanMsSecondHalf: 950,
};

/** Everything a route would do after authorization, for all three paid calls. */
async function attemptEveryPaidCall(authorized: boolean) {
  await generateInterpretation({ profile: PROFILE, authorized });
  await generatePrediction({
    gameId: 'game-abcdefgh',
    round: 1,
    profile: PROFILE,
    history: [],
    authorized,
  });
  await generateDebrief({
    profile: PROFILE,
    history: [],
    predictions: [],
    accuracy: 0.5,
    drift: DRIFT,
    authorized,
  });
}

/** A store whose every operation rejects, as an unreachable or erroring Redis does. */
function brokenStore(error: Error): CounterStore {
  return {
    kind: 'redis',
    incr: () => Promise.reject(error),
    setIfAbsent: () => Promise.reject(error),
    get: () => Promise.reject(error),
  };
}

/** A store that never answers at all. */
function hangingStore(): CounterStore {
  const never = () => new Promise<never>(() => {});
  return { kind: 'redis', incr: never, setIfAbsent: never, get: never };
}

beforeEach(() => {
  parseSpy.mockClear();
  __resetOpenAIForTests();
  __setCounterStoreForTests(createMemoryStore());
});

afterEach(() => {
  vi.unstubAllEnvs();
  __setCounterStoreForTests(null);
  __resetOpenAIForTests();
});

describe('the spy itself is wired up', () => {
  it('records a call when one is genuinely authorized', async () => {
    productionWithRedis();
    // Authorized by hand: this is the control case that proves a zero elsewhere means
    // "refused", not "the spy was never connected".
    await generatePrediction({
      gameId: 'game-abcdefgh',
      round: 1,
      profile: PROFILE,
      history: [],
      authorized: true,
    });
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Redis missing', () => {
  it('refuses authorization and spends nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
    vi.stubEnv('MOCK_AI', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const decision = await authorizeAiCall({
      kind: 'predict',
      gameId: 'game-abcdefgh',
      identityHash: 'identity-1',
    });
    expect(decision).toEqual({ allowed: false, reason: 'fail_closed' });

    await attemptEveryPaidCall(decision.allowed);
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });
});

describe('Redis unreachable', () => {
  it('refuses authorization and spends nothing', async () => {
    productionWithRedis();
    const store = brokenStore(new Error('ECONNREFUSED'));

    const decision = await authorizeAiCall({
      kind: 'predict',
      gameId: 'game-abcdefgh',
      identityHash: 'identity-1',
      store,
    });
    expect(decision).toEqual({ allowed: false, reason: 'store_unavailable' });

    await attemptEveryPaidCall(decision.allowed);
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });
});

describe('Redis returning errors', () => {
  it('treats an error reply as no authorization, for every call kind', async () => {
    productionWithRedis();
    const store = brokenStore(new Error('WRONGTYPE Operation against a key'));

    for (const kind of ['interpret', 'predict', 'debrief'] as const) {
      const decision = await authorizeAiCall({
        kind,
        gameId: 'game-abcdefgh',
        identityHash: 'identity-1',
        store,
      });
      expect(decision.allowed, `${kind} must not be authorized`).toBe(false);
      await attemptEveryPaidCall(decision.allowed);
    }
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });
});

describe('Redis timing out', () => {
  it('gives up inside the deadline and spends nothing', async () => {
    vi.useFakeTimers();
    try {
      productionWithRedis();
      const decision = authorizeAiCall({
        kind: 'predict',
        gameId: 'game-abcdefgh',
        identityHash: 'identity-1',
        store: hangingStore(),
      });
      // The store never resolves; only the deadline can settle this.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await decision).toEqual({ allowed: false, reason: 'store_unavailable' });
    } finally {
      vi.useRealTimers();
    }

    await attemptEveryPaidCall(false);
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });

  it('does not hang the request while it waits', async () => {
    productionWithRedis();
    const started = Date.now();
    const decision = await authorizeAiCall({
      kind: 'predict',
      gameId: 'game-abcdefgh',
      identityHash: 'identity-1',
      store: hangingStore(),
    });
    // Real clock, real deadline: a broken store costs a bounded wait, not a whole
    // function timeout.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(decision.allowed).toBe(false);
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });
});

describe('a broken store is never read as an empty one', () => {
  it('does not let a failed counter look like a fresh quota', async () => {
    productionWithRedis();
    // A store that fails only on the global counter — the last gate — must still
    // refuse, rather than treating the unreadable count as zero.
    const memory = createMemoryStore();
    const store: CounterStore = {
      kind: 'redis',
      setIfAbsent: (k, v, t) => memory.setIfAbsent(k, v, t),
      get: (k) => memory.get(k),
      incr: (key, ttl) =>
        key.startsWith('hg:global:') ? Promise.reject(new Error('down')) : memory.incr(key, ttl),
    };

    const decision = await authorizeAiCall({
      kind: 'predict',
      gameId: 'game-abcdefgh',
      identityHash: 'identity-1',
      store,
    });
    expect(decision).toEqual({ allowed: false, reason: 'store_unavailable' });
    await attemptEveryPaidCall(decision.allowed);
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });
});
