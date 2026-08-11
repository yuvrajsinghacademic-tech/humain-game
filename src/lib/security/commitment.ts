/**
 * The public commitment.
 *
 * Before the player is allowed to choose, the server publishes a SHA-256 hash
 * of the sealed envelope. After the choice, the reveal endpoint hands back the
 * envelope itself. Anyone — including the Playwright suite — can re-hash it and
 * confirm it is byte-for-byte what was committed to, which is what makes the
 * claim "the prediction existed before you moved" checkable rather than a
 * promise.
 *
 * Deliberately isomorphic and secret-free: it runs identically on the server and
 * in the browser, using Web Crypto in both.
 */

import type { PredictionEnvelope } from '@/types';

/**
 * Deterministic JSON. Object keys are sorted so the server and the browser
 * always produce identical bytes for identical data — without this the hash
 * would depend on property insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',');
  return `{${body}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

/** The value published before the choice. */
export async function commitmentFor(envelope: PredictionEnvelope): Promise<string> {
  return sha256Hex(canonicalJson(envelope));
}

/** The check a client or a test performs after the reveal. */
export async function verifyCommitment(
  envelope: PredictionEnvelope,
  commitment: string,
): Promise<boolean> {
  const recomputed = await commitmentFor(envelope);
  // Not secret-dependent, so a plain compare is fine here.
  return recomputed === commitment;
}

/** Short form shown on the ticket. Enough to eyeball, useless to brute force. */
export function shortCommitment(commitment: string): string {
  return commitment.slice(0, 12).toUpperCase();
}
