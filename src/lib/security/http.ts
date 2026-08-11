/**
 * Request hardening shared by every route handler.
 *
 * Bounded bodies, same-origin enforcement, bounded upstream time, and error
 * responses that carry a stable code and nothing else — no messages from
 * upstream, no stack traces, never a key.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isProduction } from './env';

/** Hard cap on any request body. The largest legitimate payload is ~4 KB. */
export const MAX_BODY_BYTES = 16 * 1024;

export type ApiErrorCode =
  | 'bad_request'
  | 'body_too_large'
  | 'unsupported_media_type'
  | 'forbidden_origin'
  | 'no_session'
  | 'invalid_ticket'
  | 'round_out_of_range'
  | 'rate_limited'
  | 'unavailable'
  | 'server_error';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  body_too_large: 413,
  unsupported_media_type: 415,
  forbidden_origin: 403,
  no_session: 401,
  invalid_ticket: 400,
  round_out_of_range: 400,
  rate_limited: 429,
  unavailable: 503,
  server_error: 500,
};

/**
 * The only error shape that leaves the server. `code` is a fixed enum member;
 * nothing derived from an exception is ever serialised.
 */
export function apiError(code: ApiErrorCode): NextResponse {
  return NextResponse.json({ ok: false, code }, { status: STATUS[code], headers: NO_STORE });
}

export const NO_STORE = { 'cache-control': 'no-store' } as const;

export function apiOk<T extends object>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

/**
 * Development-only signal for where an answer came from — the real model, the
 * deterministic stand-in, or the local fallback.
 *
 * Emitted as a response header so it shows up in devtools without ever appearing
 * in the player-facing interface, and stripped entirely in production so the
 * atmosphere is never broken by implementation detail.
 */
export function devSourceHeaders(source: string, reason?: string): Record<string, string> {
  if (isProduction()) return {};
  return { 'x-humain-ai-source': reason ? `${source} (${reason})` : source };
}

/**
 * Same-origin gate.
 *
 * The client always sends `Origin` on these POSTs, so a mismatch is a real
 * cross-site attempt. Outside production a request with no origin signal at all
 * is allowed, which keeps route handlers directly unit-testable.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    // A declared origin is always checked. If no proxy set a Host header, the
    // request's own URL is the authority — an Origin that disagrees with the host
    // being addressed is cross-origin either way.
    const expected = request.headers.get('host') ?? safeHost(request.url);
    if (!expected) return false;
    try {
      return new URL(origin).host === expected;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';
  return !isProduction();
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export class BodyTooLargeError extends Error {}

/**
 * Read and validate a JSON body under a byte cap.
 *
 * Both the advertised length and the actual bytes are checked, because
 * `content-length` is attacker-controlled.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; code: ApiErrorCode }> {
  /*
   * Only real JSON is accepted.
   *
   * Partly hygiene, partly defence in depth: `text/plain` and the form types are
   * CORS-"simple", so a cross-site request carrying one needs no preflight. The
   * origin check and a `SameSite=Lax` cookie already refuse those, and this makes
   * the browser ask permission before they are even sent.
   */
  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') return { ok: false, code: 'unsupported_media_type' };

  const advertised = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(advertised) && advertised > MAX_BODY_BYTES) {
    return { ok: false, code: 'body_too_large' };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, code: 'bad_request' };
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false, code: 'body_too_large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: 'bad_request' };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) return { ok: false, code: 'bad_request' };
  return { ok: true, data: result.data };
}

/**
 * Bound an upstream call. Resolves to `null` on timeout rather than throwing, so
 * callers treat "slow" exactly like "unavailable" and fall back.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Log a server-side problem without ever echoing secrets or upstream bodies. */
export function logQuietly(scope: string, code: string): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return;
  console.warn(`[humain] ${scope}: ${code}`);
}
