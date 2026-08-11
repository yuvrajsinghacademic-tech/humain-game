import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DEBRIEF_PER_GAME,
  MAX_GAMES_PER_IDENTITY,
  MAX_INTERPRET_PER_GAME,
  MAX_PREDICTIONS_PER_GAME,
  authorizeAiCall,
  checkEndpointWindow,
  claimReveal,
  globalCallsToday,
  lookupRoundTicket,
  reserveRoundTicket,
} from '@/lib/security/ratelimit';
import {
  __setCounterStoreForTests,
  clientIp,
  createMemoryStore,
  getCounterStore,
  hashIdentity,
} from '@/lib/security/counters';
import { globalDailyCallLimit, mockAiEnabled, mustFailClosed, redisConfigured } from '@/lib/security/env';

const IDENTITY = 'identity-hash-1';

beforeEach(() => {
  __setCounterStoreForTests(createMemoryStore());
});

afterEach(() => {
  __setCounterStoreForTests(null);
  delete process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT;
});

describe('memory counter store', () => {
  it('increments and expires', async () => {
    let now = 1_000_000;
    const store = createMemoryStore(() => now);
    expect(await store.incr('k', 10)).toBe(1);
    expect(await store.incr('k', 10)).toBe(2);
    now += 11_000;
    expect(await store.incr('k', 10)).toBe(1);
  });

  it('honours set-if-absent semantics', async () => {
    const store = createMemoryStore();
    expect(await store.setIfAbsent('k', 'first', 60)).toBe(true);
    expect(await store.setIfAbsent('k', 'second', 60)).toBe(false);
    expect(await store.get('k')).toBe('first');
  });

  it('reports the in-memory kind so production can refuse it', () => {
    expect(getCounterStore().kind).toBe('memory');
  });
});

describe('identity hashing', () => {
  it('never contains the raw address', () => {
    const hash = hashIdentity('203.0.113.42');
    expect(hash).not.toContain('203.0.113.42');
    expect(hash).toHaveLength(22);
  });

  it('is stable for one address and different across addresses', () => {
    expect(hashIdentity('203.0.113.42')).toBe(hashIdentity('203.0.113.42'));
    expect(hashIdentity('203.0.113.42')).not.toBe(hashIdentity('203.0.113.43'));
  });

  it('still produces a key for a missing address', () => {
    expect(hashIdentity(null)).toHaveLength(22);
  });

  it('reads the client address from the platform headers', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(clientIp(new Headers())).toBeNull();
  });

  /*
   * The rate-limit identity must not be something a caller can choose. If it were,
   * the per-identity game budget would be one header away from unlimited.
   */
  it('prefers the headers the platform writes over the one a caller can set', () => {
    const spoofed = new Headers({
      'x-forwarded-for': '1.2.3.4',
      'x-vercel-forwarded-for': '203.0.113.7',
    });
    expect(clientIp(spoofed)).toBe('203.0.113.7');

    const withRealIp = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '198.51.100.9' });
    expect(clientIp(withRealIp)).toBe('198.51.100.9');
  });

  it('ignores a Cloudflare header entirely, since nothing sets it here', () => {
    // Vercel does not write `cf-connecting-ip`, so honouring it would hand every
    // caller a free identity rotation.
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4' }))).toBeNull();
  });

  it('lands a spoofing attempt in the platform bucket, not one of its choosing', () => {
    const platform = hashIdentity(clientIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.7' })));
    const spoofAttempt = hashIdentity(
      clientIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '9.9.9.9' })),
    );
    expect(spoofAttempt).toBe(platform);
  });
});

describe('per-game quotas', () => {
  it('allows exactly one calibration interpretation per game', async () => {
    const first = await authorizeAiCall({ kind: 'interpret', gameId: 'g1', identityHash: IDENTITY });
    const second = await authorizeAiCall({ kind: 'interpret', gameId: 'g1', identityHash: IDENTITY });
    expect(first.allowed).toBe(true);
    expect(second).toEqual({ allowed: false, reason: 'game_quota' });
    expect(MAX_INTERPRET_PER_GAME).toBe(1);
  });

  it('allows exactly one debrief per game', async () => {
    expect((await authorizeAiCall({ kind: 'debrief', gameId: 'g1', identityHash: IDENTITY })).allowed).toBe(true);
    expect(await authorizeAiCall({ kind: 'debrief', gameId: 'g1', identityHash: IDENTITY })).toEqual({
      allowed: false,
      reason: 'game_quota',
    });
    expect(MAX_DEBRIEF_PER_GAME).toBe(1);
  });

  it('allows exactly fifteen predictions per game and refuses the sixteenth', async () => {
    for (let i = 0; i < MAX_PREDICTIONS_PER_GAME; i += 1) {
      const result = await authorizeAiCall({ kind: 'predict', gameId: 'g1', identityHash: IDENTITY });
      expect(result.allowed, `prediction ${i + 1}`).toBe(true);
    }
    expect(await authorizeAiCall({ kind: 'predict', gameId: 'g1', identityHash: IDENTITY })).toEqual({
      allowed: false,
      reason: 'game_quota',
    });
    expect(MAX_PREDICTIONS_PER_GAME).toBe(15);
  });

  it('keeps quotas separate per game', async () => {
    await authorizeAiCall({ kind: 'interpret', gameId: 'g1', identityHash: IDENTITY });
    expect((await authorizeAiCall({ kind: 'interpret', gameId: 'g2', identityHash: IDENTITY })).allowed).toBe(
      true,
    );
  });
});

describe('per-identity game budget', () => {
  it('allows five AI-backed games per identity, then refuses', async () => {
    for (let game = 1; game <= MAX_GAMES_PER_IDENTITY; game += 1) {
      const result = await authorizeAiCall({
        kind: 'interpret',
        gameId: `game-${game}`,
        identityHash: IDENTITY,
      });
      expect(result.allowed, `game ${game}`).toBe(true);
    }
    expect(
      await authorizeAiCall({ kind: 'interpret', gameId: 'game-6', identityHash: IDENTITY }),
    ).toEqual({ allowed: false, reason: 'identity_quota' });
  });

  it('does not charge the budget twice for the same game', async () => {
    for (let i = 0; i < 10; i += 1) {
      await authorizeAiCall({ kind: 'predict', gameId: 'same-game', identityHash: IDENTITY });
    }
    // One game consumed, so four more must still be available.
    for (let game = 2; game <= MAX_GAMES_PER_IDENTITY; game += 1) {
      expect(
        (await authorizeAiCall({ kind: 'interpret', gameId: `g${game}`, identityHash: IDENTITY })).allowed,
      ).toBe(true);
    }
    expect((await authorizeAiCall({ kind: 'interpret', gameId: 'g99', identityHash: IDENTITY })).allowed).toBe(
      false,
    );
  });

  it('budgets identities independently', async () => {
    for (let game = 1; game <= MAX_GAMES_PER_IDENTITY; game += 1) {
      await authorizeAiCall({ kind: 'interpret', gameId: `a-${game}`, identityHash: 'identity-a' });
    }
    expect(
      (await authorizeAiCall({ kind: 'interpret', gameId: 'b-1', identityHash: 'identity-b' })).allowed,
    ).toBe(true);
  });
});

describe('global daily ceiling', () => {
  it('refuses once the ceiling is reached, regardless of who is asking', async () => {
    process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT = '3';
    for (let i = 1; i <= 3; i += 1) {
      const result = await authorizeAiCall({
        kind: 'predict',
        gameId: 'game-1',
        identityHash: IDENTITY,
      });
      expect(result.allowed, `call ${i}`).toBe(true);
    }
    expect(await authorizeAiCall({ kind: 'predict', gameId: 'game-1', identityHash: IDENTITY })).toEqual({
      allowed: false,
      reason: 'global_ceiling',
    });
    // A different player is refused too: the ceiling is global.
    expect(
      await authorizeAiCall({ kind: 'interpret', gameId: 'other', identityHash: 'someone-else' }),
    ).toEqual({ allowed: false, reason: 'global_ceiling' });
  });

  it('reports the running total for an operator check', async () => {
    process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT = '100';
    expect(await globalCallsToday()).toBe(0);
    await authorizeAiCall({ kind: 'predict', gameId: 'g', identityHash: IDENTITY });
    await authorizeAiCall({ kind: 'predict', gameId: 'g', identityHash: IDENTITY });
    expect(await globalCallsToday()).toBe(2);
  });

  it('falls back to a sane default when the limit is unset or nonsense', async () => {
    process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT = 'not-a-number';
    expect((await authorizeAiCall({ kind: 'predict', gameId: 'g', identityHash: IDENTITY })).allowed).toBe(
      true,
    );
  });
});

describe('fail-closed in production without Redis', () => {
  it('refuses every paid call rather than spending unmetered', async () => {
    // Vitest sets NODE_ENV to "test"; production without Redis is what needs the guard.
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(await authorizeAiCall({ kind: 'predict', gameId: 'g', identityHash: IDENTITY })).toEqual({
        allowed: false,
        reason: 'fail_closed',
      });
      // Nothing was spent, so the global counter must not have moved either.
      expect(await globalCallsToday()).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('is keyed on configuration: production plus Redis is metered, production alone is not', () => {
    // The guard itself, across all four combinations. No client is constructed
    // here, so no network is touched.
    vi.stubEnv('NODE_ENV', 'production');
    expect(mustFailClosed()).toBe(true);

    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(redisConfigured()).toBe(true);
    expect(mustFailClosed()).toBe(false);

    vi.stubEnv('NODE_ENV', 'development');
    expect(mustFailClosed()).toBe(false);

    vi.unstubAllEnvs();
    // Back to the test environment: development may use the in-memory store.
    expect(redisConfigured()).toBe(false);
    expect(mustFailClosed()).toBe(false);
  });

  it('treats a blank Redis URL as unconfigured', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '   ');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(redisConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('environment gates', () => {
  it('defaults the global ceiling when unset', () => {
    delete process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT;
    expect(globalDailyCallLimit()).toBe(2000);
  });

  it('rejects a non-positive or non-numeric ceiling and uses the default', () => {
    vi.stubEnv('GLOBAL_DAILY_OPENAI_CALL_LIMIT', '0');
    expect(globalDailyCallLimit()).toBe(2000);
    vi.stubEnv('GLOBAL_DAILY_OPENAI_CALL_LIMIT', '-5');
    expect(globalDailyCallLimit()).toBe(2000);
    vi.stubEnv('GLOBAL_DAILY_OPENAI_CALL_LIMIT', '250');
    expect(globalDailyCallLimit()).toBe(250);
    vi.unstubAllEnvs();
  });

  it('treats a missing OpenAI key as mock mode, so no key means no spending', () => {
    delete process.env.OPENAI_API_KEY;
    expect(mockAiEnabled()).toBe(true);
  });

  it('uses the real model only when a key exists and MOCK_AI is not set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
    vi.stubEnv('MOCK_AI', '');
    expect(mockAiEnabled()).toBe(false);
    vi.stubEnv('MOCK_AI', 'true');
    expect(mockAiEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('endpoint flood windows', () => {
  it('permits a normal burst and then refuses', async () => {
    let allowed = 0;
    for (let i = 0; i < 60; i += 1) {
      if (await checkEndpointWindow('predict', IDENTITY)) allowed += 1;
    }
    expect(allowed).toBeGreaterThan(10);
    expect(allowed).toBeLessThan(60);
  });

  it('surfaces as an endpoint refusal through authorizeAiCall', async () => {
    const reasons = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const result = await authorizeAiCall({ kind: 'interpret', gameId: `g${i}`, identityHash: 'flooder' });
      if (!result.allowed) reasons.add(result.reason);
    }
    expect(reasons.has('endpoint_flood')).toBe(true);
  });
});

describe('prediction idempotency', () => {
  it('stores the first ticket for a round and returns it thereafter', async () => {
    const first = await reserveRoundTicket('g1', 3, 'token-one');
    expect(first).toEqual({ stored: true, existing: null });

    const second = await reserveRoundTicket('g1', 3, 'token-two');
    expect(second.stored).toBe(false);
    expect(second.existing).toBe('token-one');
    expect(await lookupRoundTicket('g1', 3)).toBe('token-one');
  });

  it('keeps rounds and games apart', async () => {
    await reserveRoundTicket('g1', 3, 'token-a');
    expect((await reserveRoundTicket('g1', 4, 'token-b')).stored).toBe(true);
    expect((await reserveRoundTicket('g2', 3, 'token-c')).stored).toBe(true);
    expect(await lookupRoundTicket('g1', 3)).toBe('token-a');
  });

  it('returns null for a round never issued', async () => {
    expect(await lookupRoundTicket('g1', 9)).toBeNull();
  });
});

describe('single-use reveals', () => {
  it('claims a round for the first ticket', async () => {
    expect(await claimReveal('g1', 1, 'fp-one')).toEqual({ ok: true, replay: false });
  });

  it('allows the same ticket to be re-revealed, for retries', async () => {
    await claimReveal('g1', 1, 'fp-one');
    expect(await claimReveal('g1', 1, 'fp-one')).toEqual({ ok: true, replay: true });
  });

  it('rejects a different ticket for a round already opened', async () => {
    await claimReveal('g1', 1, 'fp-one');
    expect(await claimReveal('g1', 1, 'fp-two')).toEqual({ ok: false });
  });
});
