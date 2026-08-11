import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Booth } from '@/features/prediction/Booth';
import { ChoiceScreen } from '@/features/game/ChoiceScreen';
import { Ending, EndingLoading } from '@/features/ending/Ending';
import { Opening } from '@/features/game/Opening';
import { ResultsTesting } from '@/features/game/ResultsTesting';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import type { RevealedPrediction } from '@/types';
import { buildRounds } from './factories';

/**
 * Every phrase the correction pass removed from the player-facing experience.
 * Any screen rendering one of these fails.
 */
const BANNED = [
  'trial',
  'institute for applied behavioural inference',
  'instrument 04',
  'section one',
  'section two',
  'regularity above baseline',
  'sampling procedure',
  'your model',
  'the record shows',
  'assessment closed',
  'sealed prediction',
  'seal',
  'hash',
  'held server-side',
  'verified against',
  'stated confidence',
  'replacement viability',
  'remember me',
  'forget me',
  'payout rate undisclosed',
];

function expectNoBannedCopy(where: string) {
  const text = (document.body.textContent ?? '').toLowerCase();
  for (const phrase of BANNED) {
    expect(text.includes(phrase), `${where} must not contain "${phrase}"`).toBe(false);
  }
}

const reveal = (prediction: 'A' | 'B', correct: boolean): RevealedPrediction => ({
  prediction,
  confidence: 0.83,
  reasoning: 'Holds the lever that has just paid out.',
  source: 'model',
  correct,
  commitment: 'deadbeef'.repeat(8),
  envelope: {
    v: 1,
    sessionRef: 'ref',
    gameId: 'game-abcdefgh',
    round: 1,
    prediction,
    confidence: 0.83,
    reasoning: 'Holds the lever that has just paid out.',
    source: 'model',
    issuedAt: '2026-08-10T00:00:00.000Z',
    requestId: 'req-1',
    nonce: 'nonce-1',
  },
});

describe('opening', () => {
  it('shows the wordmark in lowercase', () => {
    render(<Opening onBegin={vi.fn()} />);
    // The accessible name is the clean wordmark even while the glyphs corrupt.
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'hum(ai)n');
    const rendered = screen.getByRole('heading', { level: 1 }).textContent ?? '';
    expect(rendered).toBe(rendered.toLowerCase());
    expect(rendered).not.toMatch(/HUM/);
  });

  it('offers exactly one action, and it is the question', () => {
    render(<Opening onBegin={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('will you be replaced?');
  });

  it('contains nothing else — no institute, no estimate, no disclosure', () => {
    render(<Opening onBegin={vi.fn()} />);
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).not.toContain('institute');
    expect(text).not.toContain('instrument');
    expect(text).not.toContain('six minutes');
    expect(text).not.toContain('no account');
    expect(text).not.toContain('what this records');
    expect(text).not.toContain('assessment');
    expectNoBannedCopy('opening');
  });

  it('does not start the game itself — it opens the consent panel', async () => {
    // A short transition failure plays first, so the handover is awaited rather than
    // asserted synchronously. The detail is covered in tests/consent.test.tsx.
    const onBegin = vi.fn();
    render(<Opening onBegin={onBegin} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onBegin).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });
});

describe('choice screen', () => {
  it('offers both paths and explains neither in research language', () => {
    render(<ChoiceScreen onBegin={vi.fn()} onSkip={vi.fn()} busy={false} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Begin your assessment');
    expect(screen.getByTestId('begin-assessment')).toHaveTextContent('begin assessment');
    expect(screen.getByTestId('skip-assessment')).toHaveTextContent('skip to the game');
    expect(document.body).toHaveTextContent('Darry learns faster when you are.');

    const text = (document.body.textContent ?? '').toLowerCase();
    for (const banned of ['24 questions', '24 trials', 'research', 'sampling', 'six minutes', 'account']) {
      expect(text).not.toContain(banned);
    }
    expectNoBannedCopy('choice screen');
  });
});

describe('results transition', () => {
  it('shows the testing line while Darry is still working', () => {
    render(<ResultsTesting ready={false} onPlay={vi.fn()} />);
    expect(screen.getByTestId('testing-line')).toHaveTextContent('testing your results');
    expect(screen.queryByTestId('play-the-game')).not.toBeInTheDocument();
  });

  it('reports the result and then that Darry is ready', async () => {
    render(<ResultsTesting ready onPlay={vi.fn()} />);
    expect(screen.getByTestId('tested-line')).toHaveTextContent('Your results have been tested.');
    await waitFor(() => expect(screen.getByTestId('darry-ready')).toHaveTextContent('Darry is ready.'));
    expect(screen.getByTestId('play-the-game')).toHaveTextContent('play the game');
  });

  it('shows no analytics whatsoever', async () => {
    render(<ResultsTesting ready onPlay={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('darry-ready')).toBeInTheDocument());
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const banned of [
      'you were not being tested',
      'win-stay',
      'switch rate',
      'median decision',
      'smoothed',
      'continue to section two',
      '%',
    ]) {
      expect(text).not.toContain(banned);
    }
    expectNoBannedCopy('results transition');
  });
});

describe('prediction booth', () => {
  const boothProps = {
    round: 3,
    coins: 40,
    onPull: vi.fn(),
    onNext: vi.fn(),
    choice: null,
    lastWin: null,
    reveal: null,
  };

  it('keeps both machines disabled while Darry is picking', () => {
    render(<Booth {...boothProps} picking sealed={false} />);
    expect(screen.getByTestId('darry-status')).toHaveTextContent('Darry is picking his answer...');
    expect(screen.getByTestId('machine-A')).toBeDisabled();
    expect(screen.getByTestId('machine-B')).toBeDisabled();
    // Also out of the tab order, so a keyboard cannot reach them early.
    expect(screen.getByTestId('machine-A')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('machine-A')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not fire a pull from a disabled machine', async () => {
    const onPull = vi.fn();
    render(<Booth {...boothProps} onPull={onPull} picking sealed={false} />);
    await userEvent.click(screen.getByTestId('machine-A')).catch(() => undefined);
    expect(onPull).not.toHaveBeenCalled();
  });

  it('enables the machines only once a prediction has been sealed', async () => {
    const onPull = vi.fn();
    render(<Booth {...boothProps} onPull={onPull} picking={false} sealed />);
    expect(screen.getByTestId('darry-status')).toHaveTextContent('Darry has picked his answer.');
    expect(screen.getByTestId('machine-A')).toBeEnabled();
    expect(screen.getByTestId('machine-B')).toBeEnabled();

    await userEvent.click(screen.getByTestId('machine-B'));
    expect(onPull).toHaveBeenCalledWith('B');
  });

  it('shows the round, the coins and Darry’s state, and no live accuracy', () => {
    render(<Booth {...boothProps} picking={false} sealed />);
    expect(screen.getByTestId('round-counter')).toHaveTextContent(`round 3 / ${TOTAL_ROUNDS}`);
    expect(screen.getByTestId('coins')).toHaveTextContent('40');
    expect(screen.getByTestId('darry-state')).toHaveTextContent('darry: ready');
    // Accuracy is saved for the ending.
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).not.toContain('read you');
    expect(text).not.toContain('accuracy');
    expect(text).not.toContain('%');
  });

  it('shows only the minimal round result', () => {
    render(
      <Booth
        {...boothProps}
        picking={false}
        sealed
        reveal={reveal('A', false)}
        choice="B"
        lastWin={false}
      />,
    );
    const result = screen.getByTestId('round-result');
    expect(result).toHaveTextContent('Darry chose A.');
    expect(result).toHaveTextContent('You chose B.');
    expect(screen.getByTestId('verdict')).toHaveTextContent('Darry was wrong.');
    expect(screen.getByTestId('reward')).toHaveTextContent('no reward');
  });

  it('reports a correct call and the reward when the machine paid', () => {
    render(
      <Booth {...boothProps} picking={false} sealed reveal={reveal('A', true)} choice="A" lastWin />,
    );
    expect(screen.getByTestId('verdict')).toHaveTextContent('Darry was correct.');
    expect(screen.getByTestId('reward')).toHaveTextContent('+10');
  });

  it('leaks no confidence, reasoning, commitment or seal language', () => {
    render(
      <Booth {...boothProps} picking={false} sealed reveal={reveal('A', true)} choice="A" lastWin />,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('deadbeef');
    expect(text).not.toContain('83');
    expect(text).not.toContain('Holds the lever');
    expect(text.toLowerCase()).not.toContain('anticipated');
    expect(text.toLowerCase()).not.toContain('model');
    expectNoBannedCopy('booth result');
    // The commitment must not be smuggled into an attribute either.
    expect(document.body.innerHTML).not.toContain('deadbeef');
  });
});

describe('ending', () => {
  it('shows a restrained loading state', () => {
    render(<EndingLoading />);
    expect(screen.getByTestId('loading-results')).toHaveTextContent('loading results');
  });

  it('reveals the two lines in order, then the percentages', async () => {
    const rounds = buildRounds(
      'A'.repeat(TOTAL_ROUNDS),
      '1'.repeat(TOTAL_ROUNDS),
      'AAAAAAAAAAAABBB',
    );
    render(<Ending rounds={rounds} report={null} onPlayAgain={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('unfortunately')).toHaveTextContent('Unfortunately.'));
    /*
     * The verdict is deliberately held back until 260ms + VERDICT_DELAY_MS, which is
     * past `waitFor`'s default 1000ms budget — without an explicit timeout this passes
     * on an idle machine and fails under load.
     */
    await waitFor(
      () => expect(screen.getByTestId('verdict-line')).toHaveTextContent('You will be replaced.'),
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByTestId('final-numbers')).toBeInTheDocument(), {
      timeout: 5000,
    });

    // 12 of 15 = 80%, so the player gets exactly 20%.
    expect(screen.getByTestId('score-darry')).toHaveTextContent('80%');
    expect(screen.getByTestId('score-you')).toHaveTextContent('20%');
    expect(screen.getByTestId('ending-note')).toHaveTextContent('12 of your 15');
  });

  it('offers play again and neither remember nor forget', async () => {
    const onPlayAgain = vi.fn();
    render(
      <Ending
        rounds={buildRounds('A'.repeat(TOTAL_ROUNDS), '1'.repeat(TOTAL_ROUNDS))}
        report={null}
        onPlayAgain={onPlayAgain}
      />,
    );
    // The reveal is staged over ~2.2s, so this needs more than the default window.
    await waitFor(() => expect(screen.getByTestId('play-again')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.queryByText(/remember me/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/forget me/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('play-again'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('shows no dashboard, odds table or viability block', async () => {
    render(
      <Ending
        rounds={buildRounds('A'.repeat(TOTAL_ROUNDS), '1'.repeat(TOTAL_ROUNDS))}
        report={{
          tendencies: ['a', 'b', 'c'],
          paragraph: 'A long behavioural essay that must never be shown.',
          replacementViability: 61,
          finalObservation: 'Short line.',
        }}
        onPlayAgain={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('final-numbers')).toBeInTheDocument(), {
      timeout: 5000,
    });
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).not.toContain('a long behavioural essay');
    expect(text).not.toContain('coins collected');
    expect(text).not.toContain('payout rate');
    expect(text).not.toContain('better bet');
    expect(text).not.toContain('61');
    expectNoBannedCopy('ending');
  });
});
