/**
 * Prompt construction.
 *
 * Three things are true of every prompt built here and all three are load-bearing:
 *
 *  1. No free-form player text is ever interpolated. The player only ever clicks
 *     one of two buttons, so there is no prompt-injection surface by design.
 *  2. The hidden machine odds are never included. The model is predicting a
 *     person, not solving a bandit; handing it the odds would let it answer the
 *     wrong question and would make the round trivially winnable.
 *  3. Nothing identifying goes out: no ids, no IP, no timestamps, no user agent.
 *     Only rounded behavioral rates and a compact choice/outcome list.
 */

import type { DriftSummary, HistoryEntry, PredictRequest } from './schemas';
import type { ProfileSummary } from '@/lib/behavior/profile';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';

const PROFILE_LEGEND = `Profile fields, all 0-1 unless noted, all smoothed toward 0.5 when evidence is thin:
winStay=stays after a payout, loseSwitch=switches after a miss, alternation=switch rate,
exploration=picks the worse-looking option, risk=takes variable over fixed payout,
sideBias=picks the left-hand option, recency=obeys the last result over the whole record,
reactance=changed behaviour after being told a pattern was detected,
consistency=how well one simple rule fits them, winStreakStay/lossStreakSwitch=streak reactions,
meanMs/switchMs/repeatMs=decision latency in ms, hesitationMs=switchMs minus repeatMs,
evidence=how much data backs the rates.`;

const NO_DIAGNOSIS =
  'Never make medical, psychiatric, clinical or diagnostic claims. Never suggest a disorder, ' +
  'condition, therapy or real-world employment outcome. This is a fiction inside a game.';

export const INTERPRET_INSTRUCTIONS = `You are Darry, an AI model in a psychological horror game.
You have just measured a participant's choice behaviour. Write a reading of them that is cold, specific and quietly unsettling.
Rules: clinical register, no second-person flattery, no hedging, no metaphors about machines waking up, no emoji, no markdown.
Anchor every claim in the supplied numbers. Where evidence is thin, say less rather than inventing.
headline: at most 8 words. observation: two sentences, at most 45 words total. traits: exactly three noun phrases, at most 6 words each.
${NO_DIAGNOSIS}`;

export const PREDICT_INSTRUCTIONS = `You are Darry, an AI model. You predict which of two machines a specific human will pick next.
You are given a behavioural profile derived from that person's earlier choices, plus this game's history.
You are NOT given the machines' payout probabilities and must not guess them: you are predicting the person, not the better machine.
Weigh their measured habits — staying after a win, leaving after a loss, alternating, exploring, positional preference, latency.
Do not default to A. If the evidence is genuinely balanced, say so in the explanation and pick the side their profile leans toward.
confidence: 0.5 means no idea, 0.95 is the maximum permitted.
explanation: one plain clause, at most 12 words, present tense, no markdown, no quotes.
${NO_DIAGNOSIS}`;

export const DEBRIEF_INSTRUCTIONS = `You are Darry, an AI model closing a game you have just played against a human.
Summarise what the participant's play revealed. Cold, precise, no comfort, no theatrics, no emoji, no markdown.
tendencies: exactly three findings, at most 9 words each, each grounded in the supplied numbers.
paragraph: 3 to 4 sentences, at most 80 words, second person, describing what they did and what it makes predictable.
replacementViability: an integer 1-99. This is explicit in-game fiction — a "how modellable is this person" score, not an employment claim. Base it on consistency, evidence and the model's accuracy.
finalObservation: one sentence, at most 14 words and 110 characters. It is the only line of yours the player will read, so make it the most unsettling true thing you can say.
${NO_DIAGNOSIS}`;

function profileBlock(profile: ProfileSummary): string {
  return `${PROFILE_LEGEND}\n\nPROFILE: ${JSON.stringify(profile)}`;
}

function historyBlock(history: readonly HistoryEntry[]): string {
  if (history.length === 0) {
    return 'GAME HISTORY: none. This is the first round of this game.';
  }
  const lines = history.map(
    (h) => `r${h.round}: pulled ${h.choice}, ${h.win ? 'paid' : 'nothing'}, ${h.ms}ms`,
  );
  return `GAME HISTORY (oldest first):\n${lines.join('\n')}`;
}

export function buildInterpretInput(profile: ProfileSummary): string {
  return `${profileBlock(profile)}

Produce the reading.`;
}

export function buildPredictInput(request: Omit<PredictRequest, 'gameId'>): string {
  const { profile, history, round } = request;
  const streak = describeTail(history);
  return `${profileBlock(profile)}

${historyBlock(history)}

CURRENT ROUND: ${round} of ${TOTAL_ROUNDS}.${streak ? `\nRECENT PATTERN: ${streak}` : ''}

Predict this person's pull for round ${round}.`;
}

export function buildDebriefInput(input: {
  profile: ProfileSummary;
  history: readonly HistoryEntry[];
  predictions: ReadonlyArray<{ round: number; predicted: 'A' | 'B'; correct: boolean }>;
  accuracy: number;
  drift: DriftSummary;
}): string {
  const hits = input.predictions.filter((p) => p.correct).length;
  return `${profileBlock(input.profile)}

${historyBlock(input.history)}

PREDICTION RESULT: ${hits} of ${input.predictions.length} correct (${Math.round(input.accuracy * 100)}%).
PER ROUND: ${input.predictions.map((p) => `r${p.round}:${p.predicted}${p.correct ? '✓' : '✗'}`).join(' ')}
BEHAVIOURAL DRIFT: ${JSON.stringify(input.drift)}

Produce the closing assessment.`;
}

/** A short natural-language nudge about the tail of the history. Cheap, useful. */
function describeTail(history: readonly HistoryEntry[]): string | null {
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  let run = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].choice === last.choice) run += 1;
    else break;
  }
  const parts = [`last pull ${last.choice} ${last.win ? 'paid' : 'missed'}`];
  if (run > 1) parts.push(`${run} consecutive pulls of ${last.choice}`);
  const switches = history.slice(1).filter((h, i) => h.choice !== history[i].choice).length;
  parts.push(`${switches} switches in ${history.length} rounds`);
  return parts.join('; ');
}
