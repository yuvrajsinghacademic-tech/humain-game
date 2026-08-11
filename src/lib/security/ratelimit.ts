/**
 * Cost and abuse policy.
 *
 * Every paid call passes through `authorizeAiCall`. It is deliberately the only
 * door: routes cannot reach the OpenAI client without going through it.
 *
 * The layers, cheapest check first:
 *   1. per-endpoint sliding window, per identity   — blunt flood protection
 *   2. per-game quotas                             — 1 interpret, 15 predicts, 1 debrief
 *   3. per-identity game budget                    — 5 AI-backed games / 24h
 *   4. global daily ceiling                        — hard stop on total spend
 *
 * A refusal is never an error the player can see. The caller falls back to the
 * local behavioral engine and the game continues.
 */

import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { globalDailyCallLimit, mustFailClosed } from './env';
import { getCounterStore, getRedis, type CounterStore } from './counters';

/** AI-backed games per identity per rolling 24 hours. */
export const MAX_GAMES_PER_IDENTITY = 5;
/** Calibration interpretations per game. */
export const MAX_INTERPRET_PER_GAME = 1;
/** Round predictions per game. Matches `TOTAL_ROUNDS`. */
export const MAX_PREDICTIONS_PER_GAME = 15;
/** Debriefs per game. */
export const MAX_DEBRIEF_PER_GAME = 1;

/** Quota keys live slightly longer than a plausible game. */
const GAME_TTL_SECONDS = 60 * 60 * 2;
const IDENTITY_TTL_SECONDS = 60 * 60 * 24;
const GLOBAL_TTL_SECONDS = 60 * 60 * 48;
/** Idempotency records only need to outlive one round. */
export const IDEMPOTENCY_TTL_SECONDS = 900;

export type AiCallKind = 'interpret' | 'predict' | 'debrief';

export type DenialReason =
  | 'fail_closed'
  | 'store_unavailable'
  | 'endpoint_flood'
  | 'game_quota'
  | 'identity_quota'
  | 'global_ceiling';

/**
 * Ceiling on any single counter operation.
 *
 * Upstash is an HTTP call and `fetch` has no default deadline, so without this a
 * hung Redis would hold the whole request open until the platform killed it. A
 * counter that cannot answer in time is treated exactly like a counter that is
 * not there: no authorization, therefore no spend.
 */
export const STORE_TIMEOUT_MS = 1_500;

export type Authorization = { allowed: true } | { allowed: false; reason: DenialReason };

const ALLOWED: Authorization = { allowed: true };

/** Per-endpoint sliding windows. Generous for real play, hostile to scripts. */
const WINDOWS: Record<AiCallKind | 'reveal', { limit: number; window: `${number} s` }> = {
  interpret: { limit: 8, window: '60 s' },
  predict: { limit: 40, window: '60 s' },
  debrief: { limit: 8, window: '60 s' },
  reveal: { limit: 80, window: '60 s' },
};

const limiters = new Map<string, Ratelimit>();

function limiterFor(name: keyof typeof WINDOWS): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const existing = limiters.get(name);
  if (existing) return existing;
  const { limit, window } = WINDOWS[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `hg:rl:${name}`,
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

/**
 * Sliding-window check for any endpoint, including ones that cost nothing
 * (reveal). Without Redis this uses the in-memory store as a fixed window,
 * which is honest flood protection for a single dev process.
 */
export async function checkEndpointWindow(
  name: keyof typeof WINDOWS,
  identityHash: string,
  store: CounterStore = getCounterStore(),
): Promise<boolean> {
  const limiter = limiterFor(name);
  if (limiter) {
    const { success } = await limiter.limit(identityHash);
    return success;
  }
  const { limit } = WINDOWS[name];
  const bucket = Math.floor(Date.now() / 60_000);
  const count = await store.incr(`hg:mem:${name}:${identityHash}:${bucket}`, 120);
  return count <= limit;
}

export interface AuthorizeInput {
  kind: AiCallKind;
  gameId: string;
  identityHash: string;
  store?: CounterStore;
}

/**
 * Sentinel for a counter operation that failed or ran out of time.
 *
 * Distinct from any real answer, so a broken store can never be mistaken for a
 * count of zero — which would read as "nothing spent yet, go ahead".
 */
const STORE_FAILED = Symbol('store_failed');

async function bounded<T>(work: Promise<T>): Promise<T | typeof STORE_FAILED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof STORE_FAILED>((resolve) => {
        timer = setTimeout(() => resolve(STORE_FAILED), STORE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Unreachable host, an error response, a malformed reply: all the same answer.
    return STORE_FAILED;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function authorizeAiCall(input: AuthorizeInput): Promise<Authorization> {
  // Production without durable counters cannot enforce a ceiling, so it does not
  // get to spend. The game stays playable on the local engine.
  if (mustFailClosed()) return { allowed: false, reason: 'fail_closed' };

  const store = input.store ?? getCounterStore();
  const { kind, gameId, identityHash } = input;

  const window = await bounded(checkEndpointWindow(kind, identityHash, store));
  if (window === STORE_FAILED) return { allowed: false, reason: 'store_unavailable' };
  if (!window) return { allowed: false, reason: 'endpoint_flood' };

  // A game only counts against the 24h budget the first time it asks for a paid
  // call, so abandoned intros are free.
  const firstTouch = await bounded(
    store.setIfAbsent(`hg:game:${identityHash}:${gameId}`, '1', IDENTITY_TTL_SECONDS),
  );
  if (firstTouch === STORE_FAILED) return { allowed: false, reason: 'store_unavailable' };
  if (firstTouch) {
    const games = await bounded(store.incr(`hg:games:${identityHash}`, IDENTITY_TTL_SECONDS));
    if (games === STORE_FAILED) return { allowed: false, reason: 'store_unavailable' };
    if (games > MAX_GAMES_PER_IDENTITY) return { allowed: false, reason: 'identity_quota' };
  }

  const perGameLimit =
    kind === 'predict'
      ? MAX_PREDICTIONS_PER_GAME
      : kind === 'interpret'
        ? MAX_INTERPRET_PER_GAME
        : MAX_DEBRIEF_PER_GAME;
  const used = await bounded(store.incr(`hg:q:${kind}:${gameId}`, GAME_TTL_SECONDS));
  if (used === STORE_FAILED) return { allowed: false, reason: 'store_unavailable' };
  if (used > perGameLimit) return { allowed: false, reason: 'game_quota' };

  const day = new Date().toISOString().slice(0, 10);
  const globalUsed = await bounded(store.incr(`hg:global:${day}`, GLOBAL_TTL_SECONDS));
  if (globalUsed === STORE_FAILED) return { allowed: false, reason: 'store_unavailable' };
  if (globalUsed > globalDailyCallLimit()) return { allowed: false, reason: 'global_ceiling' };

  return ALLOWED;
}

/**
 * Prediction idempotency.
 *
 * A duplicate request for a round returns the ticket already issued instead of
 * buying a second one. This is also what makes a double-click harmless.
 */
export async function reserveRoundTicket(
  gameId: string,
  round: number,
  token: string,
  store: CounterStore = getCounterStore(),
): Promise<{ stored: boolean; existing: string | null }> {
  const key = `hg:idem:${gameId}:${round}`;
  const stored = await store.setIfAbsent(key, token, IDEMPOTENCY_TTL_SECONDS);
  if (stored) return { stored: true, existing: null };
  return { stored: false, existing: await store.get(key) };
}

export async function lookupRoundTicket(
  gameId: string,
  round: number,
  store: CounterStore = getCounterStore(),
): Promise<string | null> {
  return store.get(`hg:idem:${gameId}:${round}`);
}

/**
 * Single-use reveal.
 *
 * The first reveal of a round claims the slot. Re-revealing the *same* ticket is
 * allowed so a retry or a double-tap still works; a *different* ticket for an
 * already-revealed round is rejected as a replay.
 */
export async function claimReveal(
  gameId: string,
  round: number,
  fingerprint: string,
  store: CounterStore = getCounterStore(),
): Promise<{ ok: true; replay: boolean } | { ok: false }> {
  const key = `hg:rev:${gameId}:${round}`;
  const claimed = await store.setIfAbsent(key, fingerprint, IDEMPOTENCY_TTL_SECONDS);
  if (claimed) return { ok: true, replay: false };
  const existing = await store.get(key);
  if (existing === fingerprint) return { ok: true, replay: true };
  return { ok: false };
}

/** Current global spend counter, for the operator smoke test. */
export async function globalCallsToday(store: CounterStore = getCounterStore()): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const value = await store.get(`hg:global:${day}`);
  return value ? Number(value) : 0;
}
