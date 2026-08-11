import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionView, type QuestionOutcome } from '@/features/calibration/QuestionView';
import { buildCalibrationPlan } from '@/lib/behavior/trials';
import { mulberry32 } from '@/lib/behavior/rng';

const plan = buildCalibrationPlan(mulberry32(5));
const channelQuestion = plan.trials.find((t) => t.feedback === 'channel')!;
const wagerQuestion = plan.trials.find((t) => t.feedback === 'wager')!;
const timedQuestion = plan.trials.find((t) => t.deadlineMs)!;
const freeQuestion = plan.trials.find((t) => t.feedback === null)!;

function setup(trial = channelQuestion, outcome: QuestionOutcome = { rewarded: true, coins: 1 }) {
  const onCommit = vi.fn();
  const onResolve = vi.fn().mockReturnValue(outcome);
  const view = render(
    <QuestionView
      trial={trial}
      index={3}
      total={24}
      onResolve={onResolve}
      onCommit={onCommit}
      onSound={vi.fn()}
    />,
  );
  return { onCommit, onResolve, view };
}

describe('question copy', () => {
  it('counts questions, never trials', () => {
    setup();
    expect(screen.getByTestId('question-counter')).toHaveTextContent('question 04 / 24');
    expect(document.body.textContent).not.toMatch(/trial/i);
  });

  it('shows no instruction sentence at all', () => {
    setup();
    const text = document.body.textContent ?? '';
    // The player can see there are two things; they are not told what to do.
    for (const banned of [
      'sample one',
      'select a mark',
      'there is no correct answer',
      'two channels',
      'one returns more',
      'untimed',
      'timed',
      'allocate',
      'continue the sequence',
    ]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it('shows only the essential figures on a risk question', () => {
    setup(wagerQuestion, { rewarded: true, coins: wagerQuestion.wager!.safe });
    const text = document.body.textContent ?? '';
    expect(text).toContain(String(wagerQuestion.wager!.safe));
    expect(text).toContain(String(wagerQuestion.wager!.risky));
    // No explanation of the reward system.
    expect(text.toLowerCase()).not.toContain('guaranteed return');
    expect(text.toLowerCase()).not.toContain('probability');
  });
});

describe('question behaviour', () => {
  it('renders both options as buttons in display order', () => {
    setup();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(channelQuestion.displayed[0].label);
    expect(buttons[1]).toHaveAccessibleName(channelQuestion.displayed[1].label);
  });

  it('reports the chosen option, its position and a measured latency', async () => {
    const user = userEvent.setup();
    const { onCommit, onResolve } = setup();

    await user.click(screen.getAllByRole('button')[1]);
    expect(onResolve).toHaveBeenCalledWith(channelQuestion.displayed[1].id);

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const commit = onCommit.mock.calls[0][0];
    expect(commit.optionId).toBe(channelQuestion.displayed[1].id);
    expect(commit.position).toBe('right');
    expect(commit.timedOut).toBe(false);
    expect(commit.rewarded).toBe(true);
    expect(commit.responseMs).toBeGreaterThan(0);
  });

  it('shows the reward as a bare figure before advancing', async () => {
    const user = userEvent.setup();
    const { onCommit } = setup(channelQuestion, { rewarded: true, coins: 1 });

    await user.click(screen.getAllByRole('button')[0]);
    // The measurement depends on the player seeing this.
    expect(screen.getByTestId('question-response')).toHaveTextContent('+1');
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
  });

  it('shows a bare zero when nothing was returned', async () => {
    const user = userEvent.setup();
    setup(channelQuestion, { rewarded: false, coins: 0 });
    await user.click(screen.getAllByRole('button')[0]);
    expect(screen.getByTestId('question-response')).toHaveTextContent('0');
    expect(screen.getByTestId('question-response').textContent).not.toMatch(/nothing|returned/i);
  });

  it('shows no response at all for an unrewarded question', async () => {
    const user = userEvent.setup();
    setup(freeQuestion, { rewarded: null, coins: 0 });
    await user.click(screen.getAllByRole('button')[0]);
    expect(screen.getByTestId('question-response')).toBeEmptyDOMElement();
  });

  it('ignores a second click, so one question commits once', async () => {
    const user = userEvent.setup();
    const { onCommit } = setup();
    const buttons = screen.getAllByRole('button');

    await user.click(buttons[0]);
    expect(buttons[1]).toBeDisabled();
    await user.click(buttons[1]).catch(() => undefined);

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0][0].optionId).toBe(channelQuestion.displayed[0].id);
  });

  it('states a wager payoff in the accessible name, not only visually', () => {
    setup(wagerQuestion, { rewarded: true, coins: wagerQuestion.wager!.safe });
    const safe = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-label')?.includes('guaranteed'));
    expect(safe).toBeDefined();
    expect(safe).toHaveAccessibleName(/guaranteed/);
  });

  it('auto-commits a timed question as timed out when the interval closes', async () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      render(
        <QuestionView
          trial={timedQuestion}
          index={19}
          total={24}
          onResolve={() => ({ rewarded: null, coins: 0 })}
          onCommit={onCommit}
          onSound={vi.fn()}
        />,
      );
      vi.advanceTimersByTime(timedQuestion.deadlineMs! + 500);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit.mock.calls[0][0].timedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
