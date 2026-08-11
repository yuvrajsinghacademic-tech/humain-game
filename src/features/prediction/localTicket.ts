/**
 * The offline fallback ticket.
 *
 * If the browser cannot reach the prediction endpoint at all — network gone, a
 * misconfigured deploy, an origin check failing — the game still has to hold its
 * central promise: the prediction exists before the levers unlock. So the client
 * runs the local engine, builds the same envelope shape, hashes it into a
 * commitment, and only then enables the buttons. The commitment is verified
 * again at reveal exactly as a server ticket would be.
 *
 * What this path cannot do is *attest* the ordering. The plaintext lives in page
 * memory, so a determined player with devtools could read it early. That is why
 * `attested: false` is carried through to the UI and the debrief, and why the
 * server path is the primary one.
 */

import type { PredictionEnvelope, RevealedPrediction, Side } from '@/types';
import { commitmentFor, verifyCommitment } from '@/lib/security/commitment';
import { localPrediction, type CompactRound } from '@/lib/behavior/narrative';
import type { ProfileSummary } from '@/lib/behavior/profile';
import type { ClientTicket } from '@/features/game/machine';

export interface LocalTicket {
  ticket: ClientTicket;
  envelope: PredictionEnvelope;
}

function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createLocalTicket(input: {
  gameId: string;
  round: number;
  profile: ProfileSummary;
  history: readonly CompactRound[];
}): Promise<LocalTicket> {
  const narrative = localPrediction({
    profile: input.profile,
    history: input.history,
    round: input.round,
    gameId: input.gameId,
  });

  const envelope: PredictionEnvelope = {
    v: 1,
    sessionRef: 'local',
    gameId: input.gameId,
    round: input.round,
    prediction: narrative.prediction,
    confidence: narrative.confidence,
    reasoning: narrative.explanation,
    source: 'local',
    issuedAt: new Date().toISOString(),
    requestId: randomToken(12),
    nonce: randomToken(16),
  };

  const commitment = await commitmentFor(envelope);
  return {
    envelope,
    ticket: {
      token: null,
      commitment,
      round: input.round,
      issuedAt: envelope.issuedAt,
      attested: false,
    },
  };
}

/** Open a local ticket, running the same commitment check as a server reveal. */
export async function openLocalTicket(
  local: LocalTicket,
  choice: Side,
): Promise<{ reveal: RevealedPrediction; sealVerified: boolean }> {
  const sealVerified = await verifyCommitment(local.envelope, local.ticket.commitment);
  return {
    sealVerified,
    reveal: {
      prediction: local.envelope.prediction,
      confidence: local.envelope.confidence,
      reasoning: local.envelope.reasoning,
      source: 'local',
      correct: local.envelope.prediction === choice,
      envelope: local.envelope,
      commitment: local.ticket.commitment,
    },
  };
}
