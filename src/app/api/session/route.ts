/**
 * POST /api/session — start a game.
 *
 * Issues the signed, HTTP-only session cookie and a server-generated game id.
 * Both quotas and sealed-ticket binding key off these, so neither is
 * client-supplied. Nothing here costs money.
 */

import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { MissingSecretError, isProduction } from '@/lib/security/env';
import { apiError, apiOk, isSameOrigin } from '@/lib/security/http';
import {
  SESSION_COOKIE,
  newSessionId,
  sessionCookieOptions,
  verifySession,
} from '@/lib/security/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return apiError('forbidden_origin');

  try {
    // Reuse an existing session so the 24-hour game budget cannot be reset by
    // simply reloading the page.
    const existing = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    const sessionId = existing ?? newSessionId();
    const gameId = randomBytes(12).toString('base64url');

    const response = apiOk({ gameId });
    response.cookies.set(sessionCookieOptions(sessionId, isProduction()));
    return response;
  } catch (error) {
    if (error instanceof MissingSecretError) return apiError('unavailable');
    return apiError('server_error');
  }
}
