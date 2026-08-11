/**
 * POST /api/predict — issue a sealed prediction for one round.
 *
 * The whole point of this endpoint is ordering: the prediction is generated,
 * sealed and committed to *here*, before the browser is allowed to enable the
 * levers. What comes back is opaque — an authenticated-encryption token the
 * client cannot read, plus a SHA-256 commitment it can check later. The
 * plaintext prediction is not in the response.
 *
 * Costs at most one model call. Refusal by any quota is silent: the local
 * engine produces the prediction instead and it is sealed exactly the same way.
 */

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { generatePrediction } from '@/lib/ai';
import { predictRequestSchema } from '@/lib/ai/schemas';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import { commitmentFor } from '@/lib/security/commitment';
import { guardRequest } from '@/lib/security/guard';
import { apiError, apiOk, devSourceHeaders, readJson } from '@/lib/security/http';
import { authorizeAiCall, lookupRoundTicket, reserveRoundTicket } from '@/lib/security/ratelimit';
import { SEAL_TTL_SECONDS, openPrediction, sealPrediction } from '@/lib/security/seal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = guardRequest(request);
  if (!guard.ok) return apiError(guard.code);
  const { sessionId, identityHash } = guard.ctx;

  const body = await readJson(request, predictRequestSchema);
  if (!body.ok) return apiError(body.code);
  const { gameId, round, profile, history } = body.data;

  if (round < 1 || round > TOTAL_ROUNDS) return apiError('round_out_of_range');
  // A round can only be predicted once its predecessors have been played, so the
  // history length is an independent check on the claimed round number.
  if (history.length !== round - 1) return apiError('bad_request');

  try {
    // --- Idempotency: a retry or a double-click gets the ticket already issued,
    // never a second model call and never a different prediction. ---
    const cached = await lookupRoundTicket(gameId, round);
    if (cached) {
      const replayed = await reopen(cached, sessionId, gameId, round);
      if (replayed) return replayed;
    }

    const authorization = await authorizeAiCall({ kind: 'predict', gameId, identityHash });

    const outcome = await generatePrediction({
      gameId,
      round,
      profile,
      history,
      authorized: authorization.allowed,
    });

    const sealed = await sealPrediction({
      sessionId,
      gameId,
      round,
      prediction: outcome.data.prediction,
      confidence: outcome.data.confidence,
      reasoning: outcome.data.reasoning,
      source: outcome.source,
      requestId: randomUUID(),
    });

    // If a concurrent request stored a ticket first, that one is authoritative:
    // exactly one prediction may exist per round.
    const reservation = await reserveRoundTicket(gameId, round, sealed.token);
    if (!reservation.stored && reservation.existing) {
      const winner = await reopen(reservation.existing, sessionId, gameId, round);
      if (winner) return winner;
    }

    return apiOk(
      {
        token: sealed.token,
        commitment: sealed.commitment,
        round,
        issuedAt: sealed.issuedAt,
        expiresAt: sealed.expiresAt,
        ttlSeconds: SEAL_TTL_SECONDS,
      },
      // Development only, and carries no hint of the prediction itself.
      { headers: devSourceHeaders(outcome.source, outcome.fallbackReason) },
    );
  } catch {
    // No detail escapes. The client falls back to its own local ticket.
    return apiError('unavailable');
  }
}

/** Re-derive the public fields of an already-issued ticket. Never re-calls the model. */
async function reopen(token: string, sessionId: string, gameId: string, round: number) {
  try {
    const envelope = openPrediction({ token, sessionId, gameId, round });
    const commitment = await commitmentFor(envelope);
    return apiOk({
      token,
      commitment,
      round,
      issuedAt: envelope.issuedAt,
      expiresAt: new Date(new Date(envelope.issuedAt).getTime() + SEAL_TTL_SECONDS * 1000).toISOString(),
      ttlSeconds: SEAL_TTL_SECONDS,
      replayed: true,
    });
  } catch {
    return null;
  }
}
