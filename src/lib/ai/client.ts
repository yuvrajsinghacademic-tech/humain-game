/**
 * The OpenAI client. Server-only, by construction.
 *
 * `import 'server-only'` makes it a build error for any client component to
 * reach this module, so the key cannot end up in a browser bundle by accident.
 *
 * Everything expensive is fixed here rather than accepted from a caller: the
 * model, the reasoning effort, the output ceilings, and the wall-clock timeout.
 * No client input selects a model or raises a token limit.
 */

import 'server-only';
import OpenAI from 'openai';
import { openAiKey } from '@/lib/security/env';

/** Fixed model. Never client-selectable. */
export const MODEL = 'gpt-5.6-luna' as const;

/**
 * Lowest effort that still produces a usable read. These are three short
 * structured extractions, not analysis; extra reasoning is pure cost.
 */
export const REASONING_EFFORT = 'low' as const;

/** Output ceilings per call type. Deliberately tight — brevity is the aesthetic too. */
export const OUTPUT_TOKENS = {
  interpret: 300,
  predict: 120,
  debrief: 500,
} as const;

/** Wall-clock budget per call. A round must not stall behind a slow response. */
export const TIMEOUT_MS = {
  interpret: 12_000,
  predict: 9_000,
  debrief: 15_000,
} as const;

let client: OpenAI | null = null;

/** Returns null when no key is configured; callers fall back rather than throw. */
export function getOpenAI(): OpenAI | null {
  const key = openAiKey();
  if (!key) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: key,
      // Retries are handled by falling back to the local engine instead: a retry
      // doubles the cost and the round is waiting on us.
      maxRetries: 0,
    });
  }
  return client;
}

/** Test seam. */
export function __resetOpenAIForTests(): void {
  client = null;
}
