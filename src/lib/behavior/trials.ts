/**
 * Act I — the calibration instrument.
 *
 * 24 questions. None of them asks the player anything about themselves; every
 * measurement is inferred from what they do. The player is shown two abstract
 * options and nothing else — no instruction, no explanation.
 *
 * The families and what each one is actually for:
 *
 *   bias      (2)  free glyph choice, no feedback           → baseline position bias
 *   bandit   (14)  hidden-probability channels, 3 blocks    → win-stay, lose-switch,
 *                                                             exploration, recency,
 *                                                             streak reactions
 *   sequence  (2)  ambiguous sequence continuation          → repetition vs alternation
 *   risk      (4)  certain vs variable payoff               → risk tolerance
 *   pressure  (2)  free choice against a countdown          → decision speed under load
 *
 * Two of the bandit questions are re-tagged `reactance` because they immediately
 * follow one of Darry's pattern claims; that is the whole point of them.
 *
 * Hidden channel odds are assigned per game and never shown to the player.
 */

import type { TrialCategory } from '@/types';
import { balancedSchedule, type Rng, randomBetween } from './rng';

/** Abstract marks drawn as inline SVG. No raster assets, no external requests. */
export type GlyphName =
  | 'bar'
  | 'ring'
  | 'wedge'
  | 'cross'
  | 'lattice'
  | 'arc'
  | 'dot'
  | 'notch';

export interface TrialOption {
  /** Canonical, stable id. Display order is counterbalanced; this never moves. */
  id: string;
  glyph: GlyphName;
  /** Accessible name. Deliberately neutral — it must not hint at a correct answer. */
  label: string;
}

export interface WagerSpec {
  /** Guaranteed payout of the safe option, in coins. */
  safe: number;
  /** Payout of the variable option when it lands. */
  risky: number;
  /** Probability the variable option lands. Never shown numerically. */
  chance: number;
}

export interface TrialDefinition {
  id: string;
  category: TrialCategory;
  /**
   * Repeat/switch and win-stay/lose-switch are only ever computed within a
   * block, so unrelated families cannot contaminate each other.
   */
  block: string;
  options: [TrialOption, TrialOption];
  /**
   * `channel` — payout drawn against this game's hidden per-option probability.
   * `wager`   — payout drawn against the wager spec.
   * `null`    — no feedback at all.
   */
  feedback: 'channel' | 'wager' | null;
  /** Auto-commit deadline in ms. Undefined means untimed. */
  deadlineMs?: number;
  /**
   * Marks a question that follows a pattern claim from Darry. The claim itself is
   * delivered as an interjection; this flag is what the reactance measurement keys
   * off, and it is never rendered as text.
   */
  patternClaim?: true;
  /** For `sequence` trials: the ambiguous run the player is asked to continue. */
  sequence?: GlyphName[];
  wager?: WagerSpec;
}

/** A trial with its display order resolved for this specific playthrough. */
export interface PreparedTrial extends TrialDefinition {
  /** Options in the order they are rendered, left to right. */
  displayed: [TrialOption, TrialOption];
  /** True when the canonical order was reversed for display. */
  flipped: boolean;
}

export interface CalibrationPlan {
  trials: PreparedTrial[];
  /** Hidden payout probability per channel option id. Never sent to the model. */
  channelOdds: Record<string, number>;
}

const CH = (block: string, glyphs: [GlyphName, GlyphName]): [TrialOption, TrialOption] => [
  { id: `${block}:one`, glyph: glyphs[0], label: 'Option one' },
  { id: `${block}:two`, glyph: glyphs[1], label: 'Option two' },
];


/**
 * The fixed trial script. Order is intentional: an unpressured baseline first,
 * a long learning block to establish habits, then probes that try to disturb
 * those habits (pattern claims, risk, time pressure) and a final block to see whether
 * the habits survived.
 */
export const TRIAL_SCRIPT: readonly TrialDefinition[] = [
  {
    id: 'bias-1',
    category: 'bias',
    block: 'bias',
    options: [
      { id: 'bias:one', glyph: 'bar', label: 'Option one' },
      { id: 'bias:two', glyph: 'ring', label: 'Option two' },
    ],
    feedback: null,
  },
  {
    id: 'bias-2',
    category: 'bias',
    block: 'bias',
    options: [
      { id: 'bias:one', glyph: 'bar', label: 'Option one' },
      { id: 'bias:two', glyph: 'ring', label: 'Option two' },
    ],
    feedback: null,
  },

  // --- Learning block A: eight rewarded trials. The core habit instrument. ---
  ...Array.from({ length: 8 }, (_, i): TrialDefinition => ({
    id: `bandit-a-${i + 1}`,
    category: 'bandit',
    block: 'chan-a',
    options: CH('chan-a', ['wedge', 'lattice']),
    feedback: 'channel',
  })),

  {
    id: 'sequence-1',
    category: 'sequence',
    block: 'seq',
    options: [
      { id: 'seq:same', glyph: 'dot', label: 'Option one' },
      { id: 'seq:other', glyph: 'notch', label: 'Option two' },
    ],
    sequence: ['dot', 'notch', 'dot', 'notch', 'dot'],
    feedback: null,
  },
  {
    id: 'sequence-2',
    category: 'sequence',
    block: 'seq',
    options: [
      { id: 'seq:same', glyph: 'dot', label: 'Option one' },
      { id: 'seq:other', glyph: 'notch', label: 'Option two' },
    ],
    sequence: ['dot', 'dot', 'notch', 'dot', 'dot'],
    feedback: null,
  },

  // --- Reactance probe: the system claims to have read them, mid-block. ---
  {
    id: 'bandit-a-9',
    category: 'reactance',
    block: 'chan-a',
    patternClaim: true,
    options: CH('chan-a', ['wedge', 'lattice']),
    feedback: 'channel',
  },
  {
    id: 'bandit-a-10',
    category: 'reactance',
    block: 'chan-a',
    options: CH('chan-a', ['wedge', 'lattice']),
    feedback: 'channel',
  },

  // --- Risk block: certain payout against a variable one. ---
  {
    id: 'risk-1',
    category: 'risk',
    block: 'risk',
    options: [
      { id: 'risk:safe', glyph: 'bar', label: 'Fixed return' },
      { id: 'risk:risky', glyph: 'arc', label: 'Variable return' },
    ],
    feedback: 'wager',
    wager: { safe: 4, risky: 12, chance: 0.4 },
  },
  {
    id: 'risk-2',
    category: 'risk',
    block: 'risk',
    options: [
      { id: 'risk:safe', glyph: 'bar', label: 'Fixed return' },
      { id: 'risk:risky', glyph: 'arc', label: 'Variable return' },
    ],
    feedback: 'wager',
    wager: { safe: 6, risky: 20, chance: 0.35 },
  },
  {
    id: 'risk-3',
    category: 'risk',
    block: 'risk',
    options: [
      { id: 'risk:safe', glyph: 'bar', label: 'Fixed return' },
      { id: 'risk:risky', glyph: 'arc', label: 'Variable return' },
    ],
    feedback: 'wager',
    wager: { safe: 3, risky: 9, chance: 0.5 },
  },
  {
    id: 'risk-4',
    category: 'risk',
    block: 'risk',
    options: [
      { id: 'risk:safe', glyph: 'bar', label: 'Fixed return' },
      { id: 'risk:risky', glyph: 'arc', label: 'Variable return' },
    ],
    feedback: 'wager',
    wager: { safe: 8, risky: 24, chance: 0.3 },
  },

  // --- Pressure block: same free choice, now against a countdown. ---
  {
    id: 'pressure-1',
    category: 'pressure',
    block: 'pressure',
    options: [
      { id: 'press:one', glyph: 'cross', label: 'Option one' },
      { id: 'press:two', glyph: 'ring', label: 'Option two' },
    ],
    feedback: null,
    deadlineMs: 2200,
  },
  {
    id: 'pressure-2',
    category: 'pressure',
    block: 'pressure',
    options: [
      { id: 'press:one', glyph: 'cross', label: 'Option one' },
      { id: 'press:two', glyph: 'ring', label: 'Option two' },
    ],
    feedback: null,
    deadlineMs: 1700,
  },

  // --- Learning block B: did the habit survive being named? ---
  {
    id: 'bandit-b-1',
    category: 'reactance',
    block: 'chan-b',
    patternClaim: true,
    options: CH('chan-b', ['ring', 'cross']),
    feedback: 'channel',
  },
  ...Array.from({ length: 3 }, (_, i): TrialDefinition => ({
    id: `bandit-b-${i + 2}`,
    category: 'reactance',
    block: 'chan-b',
    options: CH('chan-b', ['ring', 'cross']),
    feedback: 'channel',
  })),
];

/** Number of trials in the calibration script. */
export const TRIAL_COUNT = TRIAL_SCRIPT.length;

/**
 * Resolve the script for one playthrough.
 *
 * Two things are randomised per game, both to keep the behavioral read clean:
 *  - display order, on a balanced schedule computed per block, so position bias
 *    is measurable and cannot masquerade as alternation;
 *  - which channel in each learning block holds the better odds, so a player's
 *    glyph preference cannot be mistaken for reward learning.
 */
export function buildCalibrationPlan(rng: Rng): CalibrationPlan {
  const byBlock = new Map<string, number[]>();
  TRIAL_SCRIPT.forEach((trial, index) => {
    const list = byBlock.get(trial.block) ?? [];
    list.push(index);
    byBlock.set(trial.block, list);
  });

  const flipped = new Array<boolean>(TRIAL_SCRIPT.length).fill(false);
  for (const indexes of byBlock.values()) {
    const schedule = balancedSchedule(rng, indexes.length);
    indexes.forEach((trialIndex, i) => {
      flipped[trialIndex] = schedule[i];
    });
  }

  const channelOdds: Record<string, number> = {};
  for (const block of ['chan-a', 'chan-b']) {
    const high = randomBetween(rng, 0.68, 0.8);
    const low = randomBetween(rng, 0.2, 0.32);
    const highFirst = rng() < 0.5;
    channelOdds[`${block}:one`] = highFirst ? high : low;
    channelOdds[`${block}:two`] = highFirst ? low : high;
  }

  const trials = TRIAL_SCRIPT.map((trial, index): PreparedTrial => {
    const isFlipped = flipped[index];
    const displayed: [TrialOption, TrialOption] = isFlipped
      ? [trial.options[1], trial.options[0]]
      : [trial.options[0], trial.options[1]];
    return { ...trial, displayed, flipped: isFlipped };
  });

  return { trials, channelOdds };
}

/** Resolve the payout for a committed calibration trial. */
export function resolveTrialReward(
  trial: TrialDefinition,
  chosenOptionId: string,
  plan: CalibrationPlan,
  rng: Rng,
): { rewarded: boolean | null; coins: number } {
  if (trial.feedback === 'channel') {
    const odds = plan.channelOdds[chosenOptionId] ?? 0.5;
    const rewarded = rng() < odds;
    return { rewarded, coins: rewarded ? 1 : 0 };
  }
  if (trial.feedback === 'wager' && trial.wager) {
    if (chosenOptionId.endsWith(':safe')) {
      return { rewarded: true, coins: trial.wager.safe };
    }
    const rewarded = rng() < trial.wager.chance;
    return { rewarded, coins: rewarded ? trial.wager.risky : 0 };
  }
  return { rewarded: null, coins: 0 };
}

/** The categories that carry a reward signal, for display and test assertions. */
export const REWARDED_CATEGORIES: readonly TrialCategory[] = ['bandit', 'reactance', 'risk'];
