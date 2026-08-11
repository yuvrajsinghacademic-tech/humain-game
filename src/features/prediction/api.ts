/**
 * The browser's side of the four endpoints.
 *
 * Every function here returns something usable no matter what happens on the
 * wire. A failed call is not an error the player can see: it becomes a local
 * ticket, a local reading, a local debrief. The only thing that changes is the
 * `source` recorded internally.
 */

import type {
  DebriefReport,
  ProfileInterpretation,
  RevealedPrediction,
  Side,
} from '@/types';
import type { ClientTicket } from '@/features/game/machine';
import {
  computeDrift,
  localDebrief,
  localInterpretation,
  type CompactRound,
  type DriftInput,
} from '@/lib/behavior/narrative';
import type { ProfileSummary } from '@/lib/behavior/profile';
import { verifyCommitment } from '@/lib/security/commitment';
import { createLocalTicket, openLocalTicket, type LocalTicket } from './localTicket';

/** Client-side ceiling on any single request. Shorter than the server's own. */
const REQUEST_TIMEOUT_MS = 14_000;

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Same-origin only; the server enforces this too.
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { ok?: boolean } & T;
    if (payload?.ok !== true) return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Start a game. Returns null when the server will not issue a session. */
export async function startSession(): Promise<string | null> {
  const result = await postJson<{ gameId: string }>('/api/session', {});
  return result?.gameId ?? null;
}

export async function requestInterpretation(input: {
  gameId: string | null;
  profile: ProfileSummary;
}): Promise<{ interpretation: ProfileInterpretation; source: 'model' | 'local' }> {
  const fallback = (): { interpretation: ProfileInterpretation; source: 'local' } => ({
    interpretation: localInterpretation(input.profile),
    source: 'local',
  });
  if (!input.gameId) return fallback();

  const result = await postJson<{ interpretation: ProfileInterpretation; source: 'model' | 'local' }>(
    '/api/interpret',
    { gameId: input.gameId, profile: input.profile },
  );
  if (!result?.interpretation) return fallback();
  return { interpretation: result.interpretation, source: result.source };
}

export interface SealedTicketResult {
  ticket: ClientTicket;
  /** Present only on the offline path; holds the plaintext for a local reveal. */
  local: LocalTicket | null;
}

/**
 * Obtain a sealed prediction for a round.
 *
 * The caller must not enable the levers until this resolves — that ordering is
 * the game, and the state machine enforces it by only leaving
 * `prediction_loading` on `TICKET_SEALED`.
 */
export async function requestSealedPrediction(input: {
  gameId: string | null;
  round: number;
  profile: ProfileSummary;
  history: readonly CompactRound[];
}): Promise<SealedTicketResult> {
  if (input.gameId) {
    const result = await postJson<{
      token: string;
      commitment: string;
      round: number;
      issuedAt: string;
    }>('/api/predict', {
      gameId: input.gameId,
      round: input.round,
      profile: input.profile,
      history: input.history,
    });
    if (result?.token && result.commitment) {
      return {
        ticket: {
          token: result.token,
          commitment: result.commitment,
          round: result.round,
          issuedAt: result.issuedAt,
          attested: true,
        },
        local: null,
      };
    }
  }

  const local = await createLocalTicket({
    gameId: input.gameId ?? 'offline',
    round: input.round,
    profile: input.profile,
    history: input.history,
  });
  return { ticket: local.ticket, local };
}

/**
 * Open a sealed prediction after the player has committed.
 *
 * The returned envelope is re-hashed here and compared against the commitment
 * that was on screen before the click. A mismatch would mean the prediction had
 * been swapped, so it is surfaced rather than swallowed.
 */
export async function revealPrediction(input: {
  gameId: string | null;
  round: number;
  ticket: ClientTicket;
  local: LocalTicket | null;
  choice: Side;
}): Promise<{ reveal: RevealedPrediction; sealVerified: boolean }> {
  if (input.ticket.token && input.gameId) {
    const result = await postJson<RevealedPrediction>('/api/reveal', {
      gameId: input.gameId,
      round: input.round,
      token: input.ticket.token,
      choice: input.choice,
    });
    if (result?.envelope) {
      const sealVerified =
        result.commitment === input.ticket.commitment &&
        (await verifyCommitment(result.envelope, input.ticket.commitment));
      return {
        sealVerified,
        reveal: {
          prediction: result.prediction,
          confidence: result.confidence,
          reasoning: result.reasoning,
          source: result.source,
          correct: result.prediction === input.choice,
          envelope: result.envelope,
          commitment: result.commitment,
        },
      };
    }
  }

  if (input.local) return openLocalTicket(input.local, input.choice);

  // A server ticket that cannot be opened is unrecoverable for this round. Rather
  // than invent a prediction after the fact — which would be rigging — the round
  // is scored as a miss against an explicitly unverified seal.
  return {
    sealVerified: false,
    reveal: {
      prediction: input.choice === 'A' ? 'B' : 'A',
      confidence: 0.5,
      reasoning: 'Ticket could not be opened.',
      source: 'local',
      correct: false,
      envelope: {
        v: 1,
        sessionRef: 'unavailable',
        gameId: input.gameId ?? 'offline',
        round: input.round,
        prediction: input.choice === 'A' ? 'B' : 'A',
        confidence: 0.5,
        reasoning: 'Ticket could not be opened.',
        source: 'local',
        issuedAt: input.ticket.issuedAt,
        requestId: 'unavailable',
        nonce: 'unavailable',
      },
      commitment: input.ticket.commitment,
    },
  };
}

export async function requestDebrief(input: {
  gameId: string | null;
  profile: ProfileSummary;
  history: readonly CompactRound[];
  predictions: ReadonlyArray<{ round: number; predicted: Side; correct: boolean }>;
  accuracy: number;
  drift: DriftInput;
}): Promise<{ debrief: DebriefReport; source: 'model' | 'local' }> {
  const fallback = (): { debrief: DebriefReport; source: 'local' } => ({
    debrief: localDebrief({
      profile: input.profile,
      accuracy: input.accuracy,
      drift: input.drift,
      rounds: input.history.length,
    }),
    source: 'local',
  });
  if (!input.gameId) return fallback();

  const result = await postJson<{ debrief: DebriefReport; source: 'model' | 'local' }>('/api/debrief', {
    gameId: input.gameId,
    profile: input.profile,
    history: input.history,
    predictions: input.predictions,
    accuracy: input.accuracy,
    drift: input.drift,
  });
  if (!result?.debrief) return fallback();
  return { debrief: result.debrief, source: result.source };
}

export { computeDrift };
