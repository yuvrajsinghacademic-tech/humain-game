/**
 * Wire schemas.
 *
 * Two families live here and they are deliberately different:
 *
 *  - Request schemas validate what the browser sends. They are strict and
 *    bounded — every number has a range, every array a maximum length — because
 *    this is the surface a stranger will poke at.
 *
 *  - Model output schemas describe what the model must return. They are kept
 *    structurally plain (enums, plain strings, plain numbers) because strict
 *    structured outputs reject exotic JSON Schema keywords. Range and length
 *    discipline is applied afterwards in `sanitize*`, not pushed at the model.
 */

import { z } from 'zod';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import { GAME_ID_PATTERN } from '@/lib/security/session';

const unitRate = z.number().min(0).max(1);
const latencyMs = z.number().min(0).max(120_000);

/** The compact profile the browser is allowed to send. Mirrors `ProfileSummary`. */
export const profileSummarySchema = z
  .object({
    winStay: unitRate,
    loseSwitch: unitRate,
    alternation: unitRate,
    exploration: unitRate,
    risk: unitRate,
    sideBias: unitRate,
    recency: unitRate,
    reactance: unitRate,
    consistency: unitRate,
    winStreakStay: unitRate,
    lossStreakSwitch: unitRate,
    meanMs: latencyMs,
    switchMs: latencyMs,
    repeatMs: latencyMs,
    hesitationMs: z.number().min(-120_000).max(120_000),
    trials: z.number().int().min(0).max(500),
    evidence: unitRate,
  })
  .strict();

/** One prior round, as compact as it can be and still be informative. */
export const historyEntrySchema = z
  .object({
    round: z.number().int().min(1).max(TOTAL_ROUNDS),
    choice: z.enum(['A', 'B']),
    win: z.boolean(),
    ms: latencyMs,
  })
  .strict();

/** Hard cap: a game is 15 rounds, so 15 prior rounds is the ceiling. */
export const historySchema = z.array(historyEntrySchema).max(TOTAL_ROUNDS);

const gameId = z.string().regex(GAME_ID_PATTERN);

export const interpretRequestSchema = z.object({ gameId, profile: profileSummarySchema }).strict();

export const predictRequestSchema = z
  .object({
    gameId,
    round: z.number().int().min(1).max(TOTAL_ROUNDS),
    profile: profileSummarySchema,
    history: historySchema,
  })
  .strict();

export const revealRequestSchema = z
  .object({
    gameId,
    round: z.number().int().min(1).max(TOTAL_ROUNDS),
    token: z.string().min(16).max(2048),
    choice: z.enum(['A', 'B']),
  })
  .strict();

/** Behavioral drift across the game — the debrief's "did they change" evidence. */
export const driftSchema = z
  .object({
    firstHalfSwitchRate: unitRate,
    secondHalfSwitchRate: unitRate,
    firstHalfAccuracy: unitRate,
    secondHalfAccuracy: unitRate,
    meanMsFirstHalf: latencyMs,
    meanMsSecondHalf: latencyMs,
  })
  .strict();

export const debriefRequestSchema = z
  .object({
    gameId,
    profile: profileSummarySchema,
    history: historySchema,
    predictions: z
      .array(
        z
          .object({
            round: z.number().int().min(1).max(TOTAL_ROUNDS),
            predicted: z.enum(['A', 'B']),
            correct: z.boolean(),
          })
          .strict(),
      )
      .max(TOTAL_ROUNDS),
    accuracy: unitRate,
    drift: driftSchema,
  })
  .strict();

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;
export type PredictRequest = z.infer<typeof predictRequestSchema>;
export type RevealRequest = z.infer<typeof revealRequestSchema>;
export type DebriefRequest = z.infer<typeof debriefRequestSchema>;
export type DriftSummary = z.infer<typeof driftSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

// ---------------------------------------------------------------------------
// Model output contracts
// ---------------------------------------------------------------------------

export const predictionOutputSchema = z
  .object({
    prediction: z.enum(['A', 'B']),
    confidence: z.number(),
    explanation: z.string(),
  })
  .strict();

export const interpretOutputSchema = z
  .object({
    headline: z.string(),
    observation: z.string(),
    traits: z.array(z.string()),
  })
  .strict();

export const debriefOutputSchema = z
  .object({
    tendencies: z.array(z.string()),
    paragraph: z.string(),
    replacementViability: z.number(),
    finalObservation: z.string(),
  })
  .strict();

/** Roughly twelve words. Enforced by truncation, not by trusting the model. */
const MAX_EXPLANATION_WORDS = 12;

export function trimWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

/** Strip anything that could be mistaken for markup before it reaches the DOM. */
export function scrub(text: string, maxChars: number): string {
  return text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

export function sanitizePrediction(raw: unknown): {
  prediction: 'A' | 'B';
  confidence: number;
  explanation: string;
} | null {
  const parsed = predictionOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { prediction, confidence, explanation } = parsed.data;
  return {
    prediction,
    // A model that reports 0.99 is not more right than one that reports 0.9.
    confidence: clamp(confidence, 0.5, 0.95),
    explanation: trimWords(scrub(explanation, 160), MAX_EXPLANATION_WORDS),
  };
}

export function sanitizeInterpretation(raw: unknown) {
  const parsed = interpretOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const traits = parsed.data.traits.slice(0, 3).map((t) => scrub(t, 60)).filter(Boolean);
  if (traits.length === 0) return null;
  return {
    headline: scrub(parsed.data.headline, 80),
    observation: scrub(parsed.data.observation, 260),
    traits,
  };
}

export function sanitizeDebrief(raw: unknown) {
  const parsed = debriefOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const tendencies = parsed.data.tendencies.slice(0, 3).map((t) => scrub(t, 70)).filter(Boolean);
  if (tendencies.length < 1) return null;
  return {
    tendencies,
    paragraph: scrub(parsed.data.paragraph, 600),
    replacementViability: Math.round(clamp(parsed.data.replacementViability, 1, 99)),
    finalObservation: scrub(parsed.data.finalObservation, 200),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
