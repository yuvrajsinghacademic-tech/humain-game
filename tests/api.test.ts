import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as sessionRoute } from '@/app/api/session/route';
import { POST as predictRoute } from '@/app/api/predict/route';
import { POST as revealRoute } from '@/app/api/reveal/route';
import { POST as interpretRoute } from '@/app/api/interpret/route';
import { POST as debriefRoute } from '@/app/api/debrief/route';
import { __setCounterStoreForTests, createMemoryStore } from '@/lib/security/counters';
import { SESSION_COOKIE } from '@/lib/security/session';
import { commitmentFor } from '@/lib/security/commitment';
import { computeDrift } from '@/lib/behavior/narrative';
import { deriveProfile, summarizeProfile } from '@/lib/behavior/profile';
import { MAX_BODY_BYTES } from '@/lib/security/http';
import type { PredictionEnvelope } from '@/types';
import { buildRounds, buildTrials } from './factories';

const ORIGIN = 'http://localhost:3000';

const profile = () =>
  summarizeProfile(
    deriveProfile(
      buildTrials([
        { option: 'one', rewarded: true },
        { option: 'one', rewarded: true },
        { option: 'two', rewarded: false },
        { option: 'one', rewarded: true },
      ]),
    ),
  );

interface Session {
  cookie: string;
  gameId: string;
}

function request(path: string, body: unknown, options: { cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  return new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Open a real session through the real route, exactly as the browser does. */
async function openSession(): Promise<Session> {
  const response = await sessionRoute(request('/api/session', {}));
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie') ?? '';
  const value = /hg_sid=([^;]+)/.exec(setCookie)?.[1] ?? '';
  const body = (await response.json()) as { gameId: string };
  return { cookie: `${SESSION_COOKIE}=${decodeURIComponent(value)}`, gameId: body.gameId };
}

interface PredictBody {
  ok: boolean;
  token: string;
  commitment: string;
  round: number;
  issuedAt: string;
  replayed?: boolean;
}

async function predict(session: Session, round: number, history = buildRounds('', '')) {
  const response = await predictRoute(
    request(
      '/api/predict',
      {
        gameId: session.gameId,
        round,
        profile: profile(),
        history: history.map((r) => ({ round: r.round, choice: r.choice, win: r.win, ms: r.responseMs })),
      },
      { cookie: session.cookie },
    ),
  );
  return { status: response.status, body: (await response.json()) as PredictBody };
}

beforeEach(() => {
  __setCounterStoreForTests(createMemoryStore());
});

describe('POST /api/session', () => {
  it('issues an HTTP-only, same-site session cookie and a game id', async () => {
    const response = await sessionRoute(request('/api/session', {}));
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('hg_sid=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('path=/');

    const body = (await response.json()) as { ok: boolean; gameId: string };
    expect(body.ok).toBe(true);
    expect(body.gameId).toMatch(/^[A-Za-z0-9_-]{8,40}$/);
  });

  it('reuses an existing session so reloading cannot reset the daily budget', async () => {
    const first = await openSession();
    const response = await sessionRoute(request('/api/session', {}, { cookie: first.cookie }));
    const setCookie = response.headers.get('set-cookie') ?? '';
    const reissued = /hg_sid=([^;]+)/.exec(setCookie)?.[1] ?? '';
    expect(`${SESSION_COOKIE}=${decodeURIComponent(reissued)}`).toBe(first.cookie);

    const body = (await response.json()) as { gameId: string };
    // A fresh game id, but the same session identity behind it.
    expect(body.gameId).not.toBe(first.gameId);
  });

  it('refuses a cross-origin request', async () => {
    const response = await sessionRoute(
      request('/api/session', {}, { origin: 'https://attacker.example' }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: 'forbidden_origin' });
  });
});

describe('POST /api/predict', () => {
  it('returns an opaque token and a commitment, never the prediction', async () => {
    const session = await openSession();
    const { status, body } = await predict(session, 1);

    expect(status).toBe(200);
    expect(body.token).toMatch(/^hgs1\./);
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(body.round).toBe(1);

    // The plaintext must not be anywhere in the response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('"prediction"');
    expect(serialized).not.toContain('reasoning');
    expect(serialized).not.toContain('confidence');
  });

  it('rejects a request with no session', async () => {
    const response = await predictRoute(
      request('/api/predict', { gameId: 'abcdefghij', round: 1, profile: profile(), history: [] }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: 'no_session' });
  });

  it('rejects a forged session cookie', async () => {
    const response = await predictRoute(
      request(
        '/api/predict',
        { gameId: 'abcdefghij', round: 1, profile: profile(), history: [] },
        { cookie: `${SESSION_COOKIE}=made-up-session.made-up-signature` },
      ),
    );
    expect(response.status).toBe(401);
  });

  it('rejects a cross-origin request', async () => {
    const session = await openSession();
    const response = await predictRoute(
      request(
        '/api/predict',
        { gameId: session.gameId, round: 1, profile: profile(), history: [] },
        { cookie: session.cookie, origin: 'https://attacker.example' },
      ),
    );
    expect(response.status).toBe(403);
  });

  it('rejects a round outside the game', async () => {
    const session = await openSession();
    for (const round of [0, 16, 999]) {
      const response = await predictRoute(
        request(
          '/api/predict',
          { gameId: session.gameId, round, profile: profile(), history: [] },
          { cookie: session.cookie },
        ),
      );
      expect(response.status).toBe(400);
    }
  });

  it('rejects a round number that disagrees with the history length', async () => {
    const session = await openSession();
    const response = await predictRoute(
      request(
        '/api/predict',
        {
          gameId: session.gameId,
          round: 5,
          profile: profile(),
          history: [{ round: 1, choice: 'A', win: true, ms: 500 }],
        },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(400);
  });

  it('rejects an oversized body', async () => {
    const session = await openSession();
    const response = await predictRoute(
      new NextRequest(`${ORIGIN}/api/predict`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          cookie: session.cookie,
          'content-length': String(MAX_BODY_BYTES + 1),
        },
        body: JSON.stringify({ padding: 'x'.repeat(MAX_BODY_BYTES + 100) }),
      }),
    );
    expect(response.status).toBe(413);
  });

  it('rejects unparseable and unknown-field bodies', async () => {
    const session = await openSession();
    const bad = await predictRoute(
      new NextRequest(`${ORIGIN}/api/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: session.cookie },
        body: '{not json',
      }),
    );
    expect(bad.status).toBe(400);

    const extra = await predictRoute(
      request(
        '/api/predict',
        { gameId: session.gameId, round: 1, profile: profile(), history: [], model: 'gpt-4o' },
        { cookie: session.cookie },
      ),
    );
    // A client must not be able to smuggle a model choice through.
    expect(extra.status).toBe(400);
  });

  it('is idempotent: a duplicate request for a round returns the same ticket', async () => {
    const session = await openSession();
    const first = await predict(session, 1);
    const second = await predict(session, 1);

    expect(second.status).toBe(200);
    expect(second.body.token).toBe(first.body.token);
    expect(second.body.commitment).toBe(first.body.commitment);
    expect(second.body.replayed).toBe(true);
  });

  it('issues distinct tickets for distinct rounds', async () => {
    const session = await openSession();
    const first = await predict(session, 1);
    const second = await predict(session, 2, buildRounds('A', '1'));
    expect(second.body.token).not.toBe(first.body.token);
    expect(second.body.commitment).not.toBe(first.body.commitment);
  });
});

describe('POST /api/reveal', () => {
  async function sealAndReveal(choice: 'A' | 'B') {
    const session = await openSession();
    const { body: ticket } = await predict(session, 1);
    const response = await revealRoute(
      request(
        '/api/reveal',
        { gameId: session.gameId, round: 1, token: ticket.token, choice },
        { cookie: session.cookie },
      ),
    );
    return {
      session,
      ticket,
      status: response.status,
      body: (await response.json()) as {
        ok: boolean;
        prediction: 'A' | 'B';
        confidence: number;
        reasoning: string;
        source: string;
        correct: boolean;
        commitment: string;
        envelope: PredictionEnvelope;
      },
    };
  }

  it('proves the revealed prediction is the one committed to before the choice', async () => {
    const { ticket, body, status } = await sealAndReveal('A');
    expect(status).toBe(200);

    // The commitment published before the click is unchanged...
    expect(body.commitment).toBe(ticket.commitment);
    // ...and it is the hash of the envelope handed back now.
    expect(await commitmentFor(body.envelope)).toBe(ticket.commitment);
    // A prediction swapped after the fact could not satisfy that hash.
    const flipped = { ...body.envelope, prediction: body.prediction === 'A' ? ('B' as const) : ('A' as const) };
    expect(await commitmentFor(flipped)).not.toBe(ticket.commitment);
  });

  it('scores correctness against the sealed prediction, not the choice', async () => {
    const { body } = await sealAndReveal('A');
    expect(body.correct).toBe(body.prediction === 'A');
    expect(body.envelope.round).toBe(1);
    expect(['A', 'B']).toContain(body.prediction);
  });

  it('returns the stored envelope rather than generating a new prediction', async () => {
    // Revealing twice must yield an identical requestId and nonce. A second
    // generation could not reproduce either, so this is the check that the reveal
    // path does no model work.
    const session = await openSession();
    const { body: ticket } = await predict(session, 1);
    const read = async () => {
      const response = await revealRoute(
        request(
          '/api/reveal',
          { gameId: session.gameId, round: 1, token: ticket.token, choice: 'A' },
          { cookie: session.cookie },
        ),
      );
      return (await response.json()) as { envelope: PredictionEnvelope };
    };
    const first = await read();
    const second = await read();
    expect(second.envelope.requestId).toBe(first.envelope.requestId);
    expect(second.envelope.nonce).toBe(first.envelope.nonce);
    expect(second.envelope.issuedAt).toBe(first.envelope.issuedAt);
  });

  it('never returns the raw session id', async () => {
    const { session, body } = await sealAndReveal('A');
    const rawSessionId = session.cookie.split('=')[1].split('.')[0];
    expect(JSON.stringify(body)).not.toContain(rawSessionId);
    expect(body.envelope.sessionRef).not.toBe(rawSessionId);
  });

  it('rejects a different ticket for a round already revealed', async () => {
    const session = await openSession();
    const { body: ticket } = await predict(session, 1);
    await revealRoute(
      request(
        '/api/reveal',
        { gameId: session.gameId, round: 1, token: ticket.token, choice: 'A' },
        { cookie: session.cookie },
      ),
    );

    // A ticket minted for another game, replayed into this revealed round.
    const other = await openSession();
    const { body: foreign } = await predict(other, 1);
    const response = await revealRoute(
      request(
        '/api/reveal',
        { gameId: session.gameId, round: 1, token: foreign.token, choice: 'A' },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: 'invalid_ticket' });
  });

  it('rejects a ticket presented for the wrong round', async () => {
    const session = await openSession();
    const { body: ticket } = await predict(session, 1);
    const response = await revealRoute(
      request(
        '/api/reveal',
        { gameId: session.gameId, round: 2, token: ticket.token, choice: 'A' },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(400);
  });

  it('rejects another session presenting a stolen ticket', async () => {
    const owner = await openSession();
    const { body: ticket } = await predict(owner, 1);
    const thief = await openSession();
    const response = await revealRoute(
      request(
        '/api/reveal',
        { gameId: owner.gameId, round: 1, token: ticket.token, choice: 'A' },
        { cookie: thief.cookie },
      ),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a tampered token', async () => {
    const session = await openSession();
    const { body: ticket } = await predict(session, 1);
    const [prefix, payload] = ticket.token.split('.');
    const bytes = Buffer.from(payload, 'base64url');
    bytes[bytes.length - 1] ^= 0xff;

    const response = await revealRoute(
      request(
        '/api/reveal',
        {
          gameId: session.gameId,
          round: 1,
          token: `${prefix}.${bytes.toString('base64url')}`,
          choice: 'A',
        },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /api/interpret and /api/debrief', () => {
  it('returns a usable reading', async () => {
    const session = await openSession();
    const response = await interpretRoute(
      request('/api/interpret', { gameId: session.gameId, profile: profile() }, { cookie: session.cookie }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      interpretation: { headline: string; observation: string; traits: string[] };
    };
    expect(body.interpretation.traits).toHaveLength(3);
    expect(body.interpretation.headline.length).toBeGreaterThan(0);
  });

  it('returns a bounded fictional viability score in the debrief', async () => {
    const session = await openSession();
    const rounds = buildRounds('AABBABABABBABAB', '101010101010101');
    const response = await debriefRoute(
      request(
        '/api/debrief',
        {
          gameId: session.gameId,
          profile: profile(),
          history: rounds.map((r) => ({ round: r.round, choice: r.choice, win: r.win, ms: r.responseMs })),
          predictions: rounds.map((r) => ({ round: r.round, predicted: r.predicted, correct: r.correct })),
          accuracy: 0.6,
          drift: computeDrift(rounds),
        },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      debrief: { replacementViability: number; tendencies: string[]; paragraph: string };
    };
    expect(body.debrief.replacementViability).toBeGreaterThanOrEqual(1);
    expect(body.debrief.replacementViability).toBeLessThanOrEqual(99);
    expect(body.debrief.tendencies.length).toBeGreaterThan(0);
  });

  it('rejects a debrief history longer than the game', async () => {
    const session = await openSession();
    const tooLong = Array.from({ length: 20 }, (_, i) => ({
      round: Math.min(i + 1, 15),
      choice: 'A' as const,
      win: true,
      ms: 500,
    }));
    const response = await debriefRoute(
      request(
        '/api/debrief',
        {
          gameId: session.gameId,
          profile: profile(),
          history: tooLong,
          predictions: [],
          accuracy: 0.5,
          drift: computeDrift(buildRounds('AA', '11')),
        },
        { cookie: session.cookie },
      ),
    );
    expect(response.status).toBe(400);
  });
});

describe('error responses', () => {
  it('never leak internals: every failure is a fixed code and nothing else', async () => {
    const responses = await Promise.all([
      predictRoute(request('/api/predict', { gameId: 'x', round: 1, profile: profile(), history: [] })),
      revealRoute(request('/api/reveal', { nonsense: true })),
      interpretRoute(request('/api/interpret', {}, { origin: 'https://attacker.example' })),
    ]);

    for (const response of responses) {
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['code', 'ok']);
      expect(typeof body.code).toBe('string');
      expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:\d+/);
      expect(JSON.stringify(body)).not.toContain('GAME_SEAL_SECRET');
      expect(JSON.stringify(body)).not.toContain(process.env.GAME_SEAL_SECRET as string);
    }
  });

  /*
   * Found by attacking a running production build: a JSON body sent as `text/plain`
   * was accepted. `text/plain` is a CORS-simple type, so it can cross origins with no
   * preflight — the origin check and the Lax cookie still refused it, but requiring
   * real JSON means the browser has to ask first.
   */
  it('refuses a body that is not declared as JSON', async () => {
    const session = await openSession();
    const body = { gameId: session.gameId, round: 1, profile: profile(), history: [] };

    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
      const response = await predictRoute(
        new NextRequest(`${ORIGIN}/api/predict`, {
          method: 'POST',
          headers: { ...(type ? { 'content-type': type } : {}), origin: ORIGIN, cookie: session.cookie },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status, `content-type: ${type || '(absent)'}`).toBe(415);
      expect((await response.json()).code).toBe('unsupported_media_type');
    }
  });

  it('still accepts JSON with a charset parameter', async () => {
    const session = await openSession();
    const response = await predictRoute(
      new NextRequest(`${ORIGIN}/api/predict`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          origin: ORIGIN,
          cookie: session.cookie,
        },
        body: JSON.stringify({ gameId: session.gameId, round: 1, profile: profile(), history: [] }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it('marks every response as uncacheable', async () => {
    const session = await openSession();
    const { body } = await predict(session, 1);
    expect(body.ok).toBe(true);

    const response = await predictRoute(
      request(
        '/api/predict',
        { gameId: session.gameId, round: 1, profile: profile(), history: [] },
        { cookie: session.cookie },
      ),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
