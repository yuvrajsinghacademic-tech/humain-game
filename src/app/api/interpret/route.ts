/**
 * POST /api/interpret — one reading of the calibration profile per game.
 *
 * Costs at most one model call. If any quota refuses it, or the model is slow or
 * unusable, the local narrative engine answers instead and the response looks
 * identical to the player.
 */

import type { NextRequest } from 'next/server';
import { generateInterpretation } from '@/lib/ai';
import { interpretRequestSchema } from '@/lib/ai/schemas';
import { guardRequest } from '@/lib/security/guard';
import { apiError, apiOk, devSourceHeaders, readJson } from '@/lib/security/http';
import { authorizeAiCall } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = guardRequest(request);
  if (!guard.ok) return apiError(guard.code);

  const body = await readJson(request, interpretRequestSchema);
  if (!body.ok) return apiError(body.code);
  const { gameId, profile } = body.data;

  try {
    const authorization = await authorizeAiCall({
      kind: 'interpret',
      gameId,
      identityHash: guard.ctx.identityHash,
    });
    const outcome = await generateInterpretation({ profile, authorized: authorization.allowed });
    return apiOk(
      { interpretation: outcome.data, source: outcome.source },
      { headers: devSourceHeaders(outcome.source, outcome.fallbackReason) },
    );
  } catch {
    return apiError('unavailable');
  }
}
