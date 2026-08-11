import { describe, expect, it } from 'vitest';
import {
  SealError,
  SEAL_TTL_SECONDS,
  openPrediction,
  sealPrediction,
  sessionRefFor,
  safeEqual,
  tokenFingerprint,
} from '@/lib/security/seal';
import { canonicalJson, commitmentFor, sha256Hex, shortCommitment, verifyCommitment } from '@/lib/security/commitment';
import { newSessionId, serializeSession, verifySession } from '@/lib/security/session';

const SESSION = 'session-abcdefgh';
const GAME = 'game-abcdefgh';

const seal = (overrides: Partial<Parameters<typeof sealPrediction>[0]> = {}) =>
  sealPrediction({
    sessionId: SESSION,
    gameId: GAME,
    round: 3,
    prediction: 'B',
    confidence: 0.71,
    reasoning: 'Leaves any lever the instant it disappoints.',
    source: 'model',
    requestId: 'req-1',
    ...overrides,
  });

describe('canonicalJson', () => {
  it('is stable under key ordering', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('drops undefined values and preserves array order', () => {
    expect(canonicalJson({ a: undefined, b: [3, 1, 2] })).toBe('{"b":[3,1,2]}');
  });

  it('handles nesting and primitives', () => {
    expect(canonicalJson({ z: { y: [null, true, 'x'] } })).toBe('{"z":{"y":[null,true,"x"]}}');
  });
});

describe('commitment', () => {
  it('produces a 64-character hex digest', async () => {
    const digest = await sha256Hex('humain');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies an untouched envelope', async () => {
    const { envelope, commitment } = await seal();
    await expect(verifyCommitment(envelope, commitment)).resolves.toBe(true);
  });

  it('rejects an envelope whose prediction was swapped after the fact', async () => {
    const { envelope, commitment } = await seal();
    const tampered = { ...envelope, prediction: envelope.prediction === 'A' ? ('B' as const) : ('A' as const) };
    await expect(verifyCommitment(tampered, commitment)).resolves.toBe(false);
  });

  it('rejects an envelope whose reasoning was edited', async () => {
    const { envelope, commitment } = await seal();
    await expect(verifyCommitment({ ...envelope, reasoning: 'something else' }, commitment)).resolves.toBe(
      false,
    );
  });

  it('gives different commitments to identical predictions, because of the nonce', async () => {
    const first = await seal();
    const second = await seal();
    expect(first.envelope.prediction).toBe(second.envelope.prediction);
    // Without this property a player could hash both candidate envelopes and read
    // the sealed prediction before choosing.
    expect(first.commitment).not.toBe(second.commitment);
    expect(first.envelope.nonce).not.toBe(second.envelope.nonce);
  });

  it('shortens to a displayable handle', async () => {
    const { commitment } = await seal();
    expect(shortCommitment(commitment)).toHaveLength(12);
    expect(shortCommitment(commitment)).toBe(commitment.slice(0, 12).toUpperCase());
  });
});

describe('sealPrediction / openPrediction', () => {
  it('round-trips the prediction, confidence and reasoning', async () => {
    const { token } = await seal();
    const opened = openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 3 });
    expect(opened.prediction).toBe('B');
    expect(opened.confidence).toBeCloseTo(0.71);
    expect(opened.reasoning).toContain('disappoints');
    expect(opened.source).toBe('model');
  });

  it('does not leak the prediction in the token itself', async () => {
    const { token, envelope } = await seal();
    // The token is ciphertext: none of the plaintext fields should be readable.
    const decoded = Buffer.from(token.split('.')[1], 'base64url').toString('latin1');
    expect(decoded).not.toContain('prediction');
    expect(decoded).not.toContain(envelope.reasoning);
    expect(decoded).not.toContain(envelope.nonce);
  });

  it('carries a one-way session reference rather than the session id', async () => {
    const { envelope } = await seal();
    expect(envelope.sessionRef).not.toContain(SESSION);
    expect(envelope.sessionRef).toBe(sessionRefFor(SESSION, GAME));
  });

  it('rejects a token bound to a different round', async () => {
    const { token } = await seal({ round: 3 });
    expect(() => openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 4 })).toThrow(SealError);
  });

  it('rejects a token lifted into another session', async () => {
    const { token } = await seal();
    expect(() =>
      openPrediction({ token, sessionId: 'someone-elses', gameId: GAME, round: 3 }),
    ).toThrow(SealError);
  });

  it('rejects a token lifted into another game', async () => {
    const { token } = await seal();
    expect(() => openPrediction({ token, sessionId: SESSION, gameId: 'other-game', round: 3 })).toThrow(
      SealError,
    );
  });

  it('rejects a tampered ciphertext', async () => {
    const { token } = await seal();
    const [prefix, body] = token.split('.');
    const bytes = Buffer.from(body, 'base64url');
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = `${prefix}.${bytes.toString('base64url')}`;
    expect(() => openPrediction({ token: tampered, sessionId: SESSION, gameId: GAME, round: 3 })).toThrow(
      /authentication_failed/,
    );
  });

  it('rejects malformed tokens', () => {
    for (const token of ['', 'nonsense', 'hgs1.', 'hgs1.!!!!', 'wrong.aaaa', 'hgs1.YWJj']) {
      expect(() => openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 3 })).toThrow(
        SealError,
      );
    }
  });

  it('rejects an expired envelope', async () => {
    const issued = new Date('2026-01-01T00:00:00.000Z');
    const { token } = await seal({ now: issued });
    const later = new Date(issued.getTime() + (SEAL_TTL_SECONDS + 30) * 1000);
    expect(() => openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 3, now: later })).toThrow(
      /envelope_expired/,
    );
  });

  it('accepts an envelope inside its window', async () => {
    const issued = new Date('2026-01-01T00:00:00.000Z');
    const { token } = await seal({ now: issued });
    const soon = new Date(issued.getTime() + 5_000);
    expect(
      openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 3, now: soon }).round,
    ).toBe(3);
  });

  it('reports an expiry consistent with the TTL', async () => {
    const issued = new Date('2026-01-01T00:00:00.000Z');
    const { issuedAt, expiresAt } = await seal({ now: issued });
    expect(new Date(expiresAt).getTime() - new Date(issuedAt).getTime()).toBe(SEAL_TTL_SECONDS * 1000);
  });
});

describe('tokenFingerprint', () => {
  it('is stable for a token and different across tokens', async () => {
    const first = await seal();
    const second = await seal();
    expect(tokenFingerprint(first.token)).toBe(tokenFingerprint(first.token));
    expect(tokenFingerprint(first.token)).not.toBe(tokenFingerprint(second.token));
    expect(tokenFingerprint(first.token)).not.toContain(first.token.slice(0, 12));
  });
});

describe('safeEqual', () => {
  it('compares equal strings and rejects differing ones', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('session cookies', () => {
  it('accepts a signature it produced', () => {
    const id = newSessionId();
    expect(verifySession(serializeSession(id))).toBe(id);
  });

  it('rejects an unsigned or forged session id', () => {
    expect(verifySession('forged-session-id')).toBeNull();
    expect(verifySession('forged-session-id.notasignature')).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession('')).toBeNull();
  });

  it('rejects a tampered session id with a valid-looking signature', () => {
    const id = newSessionId();
    const cookie = serializeSession(id);
    const signature = cookie.slice(cookie.lastIndexOf('.') + 1);
    expect(verifySession(`${newSessionId()}.${signature}`)).toBeNull();
  });

  it('rejects session ids outside the permitted character set', () => {
    expect(verifySession('bad id!.signature')).toBeNull();
  });

  it('generates distinct ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()));
    expect(ids.size).toBe(50);
  });
});

describe('commitment proof of ordering', () => {
  it('lets a third party prove the revealed prediction is the sealed one', async () => {
    // This is the exact check the client and the end-to-end test perform.
    const { token, commitment } = await seal();

    // ... player chooses here, having only ever seen `commitment` ...
    const revealed = openPrediction({ token, sessionId: SESSION, gameId: GAME, round: 3 });

    expect(await commitmentFor(revealed)).toBe(commitment);
    // And a prediction invented after the choice cannot satisfy the same hash.
    expect(await commitmentFor({ ...revealed, prediction: 'A' })).not.toBe(commitment);
  });
});
