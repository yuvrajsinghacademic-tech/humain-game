/**
 * POST /api/debrief — one closing report per game.
 *
 * The final model call. Receives the profile, the full compact game history, the
 * per-round prediction results, the accuracy and the behavioural drift figures.
 * It does not receive the hidden machine odds: the report is about the player.
 */

import type { NextRequest } from 'next/server';
import { generateDebrief } from '@/lib/ai';
import { debriefRequestSchema } from '@/lib/ai/schemas';
import { guardRequest } from '@/lib/security/guard';
import { apiError, apiOk, devSourceHeaders, readJson } from '@/lib/security/http';
import { authorizeAiCall } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = guardRequest(request);
  if (!guard.ok) return apiError(guard.code);

  const body = await readJson(request, debriefRequestSchema);
  if (!body.ok) return apiError(body.code);
  const { gameId, profile, history, predictions, accuracy, drift } = body.data;

  try {
    const authorization = await authorizeAiCall({
      kind: 'debrief',
      gameId,
      identityHash: guard.ctx.identityHash,
    });
    const outcome = await generateDebrief({
      profile,
      history,
      predictions,
      accuracy,
      drift,
      authorized: authorization.allowed,
    });
    return apiOk(
      { debrief: outcome.data, source: outcome.source },
      { headers: devSourceHeaders(outcome.source, outcome.fallbackReason) },
    );
  } catch {
    return apiError('unavailable');
  }
}
