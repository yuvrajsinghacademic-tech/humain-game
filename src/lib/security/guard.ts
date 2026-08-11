/**
 * The gate every API route passes through before it does anything.
 *
 * Same-origin, then a valid signed session, then a hashed identity for the rate
 * limiter. A missing sealing secret in production surfaces here as `unavailable`
 * rather than an exception, so a misconfigured deploy degrades into the local
 * engine instead of showing a player a stack trace.
 */

import 'server-only';
import type { NextRequest } from 'next/server';
import { clientIp, hashIdentity } from './counters';
import { MissingSecretError } from './env';
import type { ApiErrorCode } from './http';
import { isSameOrigin } from './http';
import { SESSION_COOKIE, verifySession } from './session';

export interface RequestContext {
  sessionId: string;
  identityHash: string;
}

export type GuardOutcome =
  | { ok: true; ctx: RequestContext }
  | { ok: false; code: ApiErrorCode };

export function guardRequest(request: NextRequest): GuardOutcome {
  if (!isSameOrigin(request)) return { ok: false, code: 'forbidden_origin' };

  try {
    const sessionId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!sessionId) return { ok: false, code: 'no_session' };
    return { ok: true, ctx: { sessionId, identityHash: hashIdentity(clientIp(request.headers)) } };
  } catch (error) {
    if (error instanceof MissingSecretError) return { ok: false, code: 'unavailable' };
    return { ok: false, code: 'server_error' };
  }
}
