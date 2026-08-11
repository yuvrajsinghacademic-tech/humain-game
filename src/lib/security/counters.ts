/**
 * The durable counter store behind every quota.
 *
 * Upstash Redis in production; a documented in-memory store for development and
 * tests only. The distinction is enforced upstream in `ratelimit.ts`: production
 * without Redis does not silently fall back to a Map, it refuses to spend money.
 */

import 'server-only';
import { Redis } from '@upstash/redis';
import { createHmac } from 'node:crypto';
import { redisConfigured, sealSecret } from './env';

export interface CounterStore {
  readonly kind: 'redis' | 'memory';
  /** Increment and return the new value, setting the TTL on first write. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Set only if absent. True means this caller won the slot. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
}

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!redisConfigured()) return null;
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    });
  }
  return redisClient;
}

function createRedisStore(redis: Redis): CounterStore {
  return {
    kind: 'redis',
    async incr(key, ttlSeconds) {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds, 'NX');
      const [count] = (await pipeline.exec()) as [number, unknown];
      return Number(count);
    },
    async setIfAbsent(key, value, ttlSeconds) {
      const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
      return result === 'OK';
    },
    async get(key) {
      const value = await redis.get<string>(key);
      return value === null || value === undefined ? null : String(value);
    },
  };
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * Process-local store. Correct for a single dev server or a test run; useless
 * across serverless instances, which is exactly why production refuses it.
 */
export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const map = new Map<string, MemoryEntry>();

  const live = (key: string): MemoryEntry | null => {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      map.delete(key);
      return null;
    }
    return entry;
  };

  return {
    kind: 'memory',
    async incr(key, ttlSeconds) {
      const entry = live(key);
      const next = String(Number(entry?.value ?? '0') + 1);
      map.set(key, { value: next, expiresAt: entry?.expiresAt ?? now() + ttlSeconds * 1000 });
      return Number(next);
    },
    async setIfAbsent(key, value, ttlSeconds) {
      if (live(key)) return false;
      map.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
      return true;
    },
    async get(key) {
      return live(key)?.value ?? null;
    },
  };
}

let store: CounterStore | null = null;

export function getCounterStore(): CounterStore {
  if (store) return store;
  const redis = getRedis();
  store = redis ? createRedisStore(redis) : createMemoryStore();
  return store;
}

/** Test seam. */
export function __setCounterStoreForTests(next: CounterStore | null): void {
  store = next;
}

/**
 * Derive a stable, non-reversible identity key from a request IP.
 *
 * The raw address is never stored or logged. It is HMAC'd with the server secret
 * and truncated, which is enough to rate-limit and not enough to re-identify.
 */
export function hashIdentity(ip: string | null): string {
  const material = ip && ip.length > 0 ? ip : 'unknown';
  return createHmac('sha256', sealSecret()).update(material, 'utf8').digest('base64url').slice(0, 22);
}

/**
 * Client address for rate-limiting, taken only from headers the platform sets.
 *
 * Order matters, and it is a trust order rather than a preference. `x-vercel-*`
 * and `x-real-ip` are written by Vercel's proxy on the way in and cannot be
 * chosen by the caller; `x-forwarded-for` is consulted last because a request
 * arriving with one already set is the ambiguous case. Nothing reads
 * `cf-connecting-ip`: no Cloudflare sits in front of this deployment, so that
 * header would be entirely caller-supplied — a free identity rotation, and with
 * it a way around the per-identity game budget.
 *
 * Being wrong here is bounded: the value is only ever HMAC'd into a rate-limit
 * key, never stored, and the global daily ceiling holds regardless.
 */
export function clientIp(headers: Headers): string | null {
  const platform = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip');
  if (platform) {
    const first = platform.split(',')[0]?.trim();
    if (first) return first;
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return null;
}
