/**
 * POST /api/reveal — open a sealed ticket after the player has committed.
 *
 * This endpoint never calls the model. It authenticates the token, checks it was
 * issued for this session, game and round, checks it has not expired or been
 * replayed, and hands back the envelope that was sealed earlier along with its
 * commitment. Because the envelope is returned verbatim, the caller can re-hash
 * it and prove the prediction is the one that was published before the choice.
 */

import type { NextRequest } from 'next/server';
import { commitmentFor } from '@/lib/security/commitment';
import { revealRequestSchema } from '@/lib/ai/schemas';
import { guardRequest } from '@/lib/security/guard';
import { apiError, apiOk, readJson } from '@/lib/security/http';
import { checkEndpointWindow, claimReveal } from '@/lib/security/ratelimit';
import { SealError, openPrediction, tokenFingerprint } from '@/lib/security/seal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = guardRequest(request);
  if (!guard.ok) return apiError(guard.code);
  const { sessionId, identityHash } = guard.ctx;

  const body = await readJson(request, revealRequestSchema);
  if (!body.ok) return apiError(body.code);
  const { gameId, round, token, choice } = body.data;

  if (!(await checkEndpointWindow('reveal', identityHash))) return apiError('rate_limited');

  try {
    // Single use per round. The same ticket may be re-revealed (retries, a
    // double-tap); a different ticket for a round already opened is a replay.
    const claim = await claimReveal(gameId, round, tokenFingerprint(token));
    if (!claim.ok) return apiError('invalid_ticket');

    const envelope = openPrediction({ token, sessionId, gameId, round });
    const commitment = await commitmentFor(envelope);

    return apiOk({
      prediction: envelope.prediction,
      confidence: envelope.confidence,
      reasoning: envelope.reasoning,
      source: envelope.source,
      correct: envelope.prediction === choice,
      commitment,
      // Verbatim, so the commitment can be recomputed and checked.
      envelope,
    });
  } catch (error) {
    if (error instanceof SealError) return apiError('invalid_ticket');
    return apiError('unavailable');
  }
}
