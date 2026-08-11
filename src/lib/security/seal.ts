/**
 * Sealed prediction envelopes.
 *
 * AES-256-GCM over the canonical envelope, with the session, game and round
 * bound in as additional authenticated data. That binding is what stops a
 * player from replaying a favourable ticket into a different round, or lifting
 * someone else's ticket into their own session: the tag will not verify.
 *
 * Standard Node primitives only — no hand-rolled cryptography.
 */

import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { PredictionEnvelope, Side } from '@/types';
import { canonicalJson, commitmentFor } from './commitment';
import { sealSecret } from './env';

const TOKEN_PREFIX = 'hgs1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
/** Fixed, non-secret HKDF salt. Domain separation, not entropy. */
const HKDF_SALT = 'humain/seal/2026';

/** How long a sealed ticket stays openable. Rounds take seconds, not minutes. */
export const SEAL_TTL_SECONDS = 900;

export class SealError extends Error {
  constructor(public readonly code: SealErrorCode) {
    super(code);
    this.name = 'SealError';
  }
}

export type SealErrorCode =
  | 'malformed_token'
  | 'authentication_failed'
  | 'envelope_invalid'
  | 'envelope_expired'
  | 'envelope_mismatch';

function derive(info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', sealSecret(), HKDF_SALT, info, KEY_BYTES));
}

/**
 * Binds the ciphertext to the exact slot it was issued for. Any change to
 * session, game or round makes the GCM tag fail.
 */
export function envelopeAad(sessionId: string, gameId: string, round: number): Buffer {
  return Buffer.from(`${TOKEN_PREFIX}|${sessionId}|${gameId}|${round}`, 'utf8');
}

export interface SealedResult {
  token: string;
  commitment: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SealInput {
  sessionId: string;
  gameId: string;
  round: number;
  prediction: Side;
  confidence: number;
  reasoning: string;
  source: PredictionEnvelope['source'];
  requestId: string;
  now?: Date;
}

/**
 * One-way reference to a session, safe to hand back to the browser inside the
 * revealed envelope. Deterministic for a session+game pair, so the reveal can
 * check it, and useless anywhere else.
 */
export function sessionRefFor(sessionId: string, gameId: string): string {
  return createHmac('sha256', derive('session-ref-v1'))
    .update(`${sessionId}|${gameId}`, 'utf8')
    .digest('base64url')
    .slice(0, 22);
}

export async function sealPrediction(input: SealInput): Promise<{ envelope: PredictionEnvelope } & SealedResult> {
  const now = input.now ?? new Date();
  const envelope: PredictionEnvelope = {
    v: 1,
    sessionRef: sessionRefFor(input.sessionId, input.gameId),
    gameId: input.gameId,
    round: input.round,
    prediction: input.prediction,
    confidence: input.confidence,
    reasoning: input.reasoning,
    source: input.source,
    issuedAt: now.toISOString(),
    requestId: input.requestId,
    // Without a nonce the commitment would be brute-forceable: there are only two
    // predictions, so a player could hash both candidates and read the answer early.
    nonce: randomBytes(16).toString('base64url'),
  };

  const key = derive('envelope-v1');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(envelopeAad(input.sessionId, input.gameId, input.round));
  const ciphertext = Buffer.concat([cipher.update(canonicalJson(envelope), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const token = `${TOKEN_PREFIX}.${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`;
  const commitment = await commitmentFor(envelope);
  const expiresAt = new Date(now.getTime() + SEAL_TTL_SECONDS * 1000).toISOString();

  return { envelope, token, commitment, issuedAt: envelope.issuedAt, expiresAt };
}

export interface OpenInput {
  token: string;
  sessionId: string;
  gameId: string;
  round: number;
  now?: Date;
}

/**
 * Authenticate and decrypt a ticket.
 *
 * Throws a coded `SealError` for every rejection path — malformed, tampered,
 * expired, or issued for a different session/game/round.
 */
export function openPrediction(input: OpenInput): PredictionEnvelope {
  const [prefix, body] = input.token.split('.');
  if (prefix !== TOKEN_PREFIX || !body) throw new SealError('malformed_token');

  let raw: Buffer;
  try {
    raw = Buffer.from(body, 'base64url');
  } catch {
    throw new SealError('malformed_token');
  }
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new SealError('malformed_token');

  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  let plaintext: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive('envelope-v1'), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(envelopeAad(input.sessionId, input.gameId, input.round));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Covers tampering, a wrong key, and a ticket bound to another round.
    throw new SealError('authentication_failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new SealError('envelope_invalid');
  }
  const envelope = parsed as PredictionEnvelope;
  if (
    !envelope ||
    envelope.v !== 1 ||
    (envelope.prediction !== 'A' && envelope.prediction !== 'B') ||
    typeof envelope.issuedAt !== 'string'
  ) {
    throw new SealError('envelope_invalid');
  }

  if (
    envelope.sessionRef !== sessionRefFor(input.sessionId, input.gameId) ||
    envelope.gameId !== input.gameId ||
    envelope.round !== input.round
  ) {
    throw new SealError('envelope_mismatch');
  }

  const now = input.now ?? new Date();
  const age = now.getTime() - new Date(envelope.issuedAt).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > SEAL_TTL_SECONDS * 1000) {
    throw new SealError('envelope_expired');
  }

  return envelope;
}

/** Stable, non-reversible handle for a token, used as an idempotency value. */
export function tokenFingerprint(token: string): string {
  return createHmac('sha256', derive('fingerprint-v1'))
    .update(token, 'utf8')
    .digest('base64url')
    .slice(0, 32);
}

/** Constant-time string compare for secret-derived values. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
