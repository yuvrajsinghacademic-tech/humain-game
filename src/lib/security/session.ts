/**
 * Server-issued session identity.
 *
 * A random id in an HMAC-signed, HTTP-only cookie. The signature means the
 * client cannot mint or edit a session id, which matters because per-game
 * quotas and sealed-ticket binding both key off it. No IP address, no
 * fingerprint, nothing derived from the person.
 */

import 'server-only';
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { sealSecret } from './env';

export const SESSION_COOKIE = 'hg_sid';
/** Long enough for a leisurely playthrough, short enough to be disposable. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

const HKDF_SALT = 'humain/session/2026';

function signingKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', sealSecret(), HKDF_SALT, 'session-v1', 32));
}

function sign(sessionId: string): string {
  return createHmac('sha256', signingKey()).update(sessionId, 'utf8').digest('base64url');
}

export function newSessionId(): string {
  return randomBytes(16).toString('base64url');
}

export function serializeSession(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/** Returns the session id only when the signature verifies. */
export function verifySession(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0) return null;
  const sessionId = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return null;

  const expected = Buffer.from(sign(sessionId), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  return sessionId;
}

export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(sessionId: string, secure: boolean): SessionCookieOptions {
  return {
    name: SESSION_COOKIE,
    value: serializeSession(sessionId),
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Game ids are client-proposed but format-checked and always paired with a session. */
export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;
