/**
 * Server environment access.
 *
 * One place decides what mode the server is in, so no route has to guess. None
 * of these values are ever returned to a client or included in an error body.
 */

import 'server-only';

/**
 * Development-only sealing secret.
 *
 * The whole game must run on a fresh clone with no secrets configured, and
 * sealing is load-bearing for the core mechanic, so localhost gets a fixed key.
 * It is never used when NODE_ENV is production — see `sealSecret()`.
 */
const DEV_SEAL_SECRET = 'humain-development-seal-secret-do-not-use-in-production';

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
export const isTest = (): boolean => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/**
 * Minimum acceptable length for a real sealing secret.
 *
 * The policy is 32 *bytes* of random material, which is 43 characters once base64url
 * encoded — so the check is 43, not 32. A 32-character hex string would satisfy a
 * naive length check while carrying only 16 bytes of entropy.
 */
export const MIN_SECRET_LENGTH = 43;

export class MissingSecretError extends Error {
  constructor() {
    super('GAME_SEAL_SECRET is not configured');
    this.name = 'MissingSecretError';
  }
}

/**
 * The sealing/signing secret.
 *
 * Production requires a real one and throws without it; the caller turns that
 * into a quiet 503 and the client falls back to the local engine, so a
 * misconfigured deploy degrades instead of leaking a stack trace to a player.
 */
export function sealSecret(): string {
  const configured = process.env.GAME_SEAL_SECRET?.trim();
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (isProduction()) throw new MissingSecretError();
  return DEV_SEAL_SECRET;
}

export function openAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * True when no paid call should ever be attempted: either explicitly requested,
 * or there is no key to call with.
 */
export function mockAiEnabled(): boolean {
  if (process.env.MOCK_AI?.trim().toLowerCase() === 'true') return true;
  return openAiKey() === null;
}

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

/** Hard ceiling on OpenAI calls per UTC day across all players. */
export function globalDailyCallLimit(): number {
  const raw = Number(process.env.GLOBAL_DAILY_OPENAI_CALL_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return 2000;
  return Math.floor(raw);
}

/**
 * Whether unmetered paid calls must be refused.
 *
 * Production without Redis has no durable way to enforce a spend ceiling, so it
 * fails closed: the game keeps running on the local behavioral engine and no
 * money can be spent. Development and test may use the in-memory counter.
 */
export function mustFailClosed(): boolean {
  return isProduction() && !redisConfigured();
}
