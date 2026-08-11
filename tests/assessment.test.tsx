import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssessmentScreen } from '@/features/calibration/AssessmentScreen';
import { Consent } from '@/features/game/Consent';
import { reactionAt, reactionSchedule } from '@/lib/behavior/reactions';
import { buildCalibrationPlan } from '@/lib/behavior/trials';
import { mulberry32 } from '@/lib/behavior/rng';
import { __clearPatternCache } from '@/lib/visual/clientOnly';

const plan = buildCalibrationPlan(mulberry32(5));
const SEED = 1;

/** The first question index that produces a reaction under this seed. */
const reactingIndex = reactionSchedule(SEED, plan.trials.length)[0].index;

function renderQuestion(index: number) {
  const onCommit = vi.fn();
  const onResolve = vi.fn().mockReturnValue({ rewarded: true, coins: 1 });
  const view = render(
    <AssessmentScreen
      trial={plan.trials[index]}
      index={index}
      total={plan.trials.length}
      seed={SEED}
      onResolve={onResolve}
      onCommit={onCommit}
      onSound={vi.fn()}
    />,
  );
  return { onCommit, onResolve, view };
}

describe('the assessment never pauses', () => {
  it('adds no delay of its own to the commit', async () => {
    /*
     * The question already holds a short reward beat before committing — that beat is
     * the behavioural instrument and predates reactions. What matters here is that a
     * reaction adds nothing on top: the commit lands at the same moment whether one
     * fires or not.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const quiet = [...Array(plan.trials.length).keys()].find(
        (index) => reactionAt(index, SEED, plan.trials.length) === null && index > 2,
      )!;

      const silent = renderQuestion(quiet);
      await user.click(screen.getByTestId('question-option-0'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(silent.onCommit).toHaveBeenCalledTimes(1);
      silent.view.unmount();

      const reacting = renderQuestion(reactingIndex);
      await user.click(screen.getByTestId('question-option-0'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      // Same window, reaction or not.
      expect(reacting.onCommit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the reaction alongside the question, not instead of it', async () => {
    const user = userEvent.setup();
    renderQuestion(reactingIndex);

    await user.click(screen.getByTestId('question-option-0'));
    await waitFor(() => expect(screen.getByTestId('reaction')).toBeInTheDocument());

    // The question is still there. Nothing was replaced and no phase was entered.
    expect(screen.getByTestId('question-counter')).toBeInTheDocument();
    expect(screen.getByTestId('question-option-0')).toBeInTheDocument();
  });

  it('renders none of the removed interruption phrases', async () => {
    const user = userEvent.setup();
    renderQuestion(reactingIndex);
    await user.click(screen.getByTestId('question-option-0'));
    await waitFor(() => expect(screen.getByTestId('reaction')).toBeInTheDocument());

    const body = (document.body.textContent ?? '').toLowerCase();
    for (const phrase of [
      'you switched.',
      'pattern forming.',
      'you changed your answer.',
      'that was different.',
      'again.',
      'you hesitated.',
      'darry noticed.',
      'darry expected that.',
    ]) {
      expect(body).not.toContain(phrase);
    }
  });

  it('only ever shows one of the two permitted words', async () => {
    const user = userEvent.setup();
    renderQuestion(reactingIndex);
    await user.click(screen.getByTestId('question-option-0'));
    await waitFor(() => expect(screen.getByTestId('reaction')).toBeInTheDocument());
    expect(['interesting.', 'strange.']).toContain(screen.getByTestId('reaction').textContent);
  });

  it('stays silent on a question the schedule does not react to', async () => {
    const quiet = [...Array(plan.trials.length).keys()].find(
      (index) => reactionAt(index, SEED, plan.trials.length) === null && index > 2,
    )!;
    const user = userEvent.setup();
    renderQuestion(quiet);
    await user.click(screen.getByTestId('question-option-0'));
    expect(screen.queryByTestId('reaction')).not.toBeInTheDocument();
  });
});

describe('the reaction slot', () => {
  it('is always present, so the layout cannot jump', () => {
    renderQuestion(reactingIndex);
    // Reserved whether or not anything is in it.
    expect(screen.getByTestId('reaction-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('reaction')).not.toBeInTheDocument();
  });

  it('cannot intercept a pointer aimed at a choice', () => {
    renderQuestion(reactingIndex);
    const slot = screen.getByTestId('reaction-slot');
    // The stylesheet sets pointer-events: none; the class is the contract.
    expect(slot.className).toMatch(/slot/);
    expect(slot).not.toHaveAttribute('onclick');
  });

  it('takes no focus and holds nothing focusable', async () => {
    const user = userEvent.setup();
    renderQuestion(reactingIndex);
    await user.click(screen.getByTestId('question-option-0'));
    await waitFor(() => expect(screen.getByTestId('reaction')).toBeInTheDocument());

    const slot = screen.getByTestId('reaction-slot');
    expect(slot).not.toHaveAttribute('tabindex');
    expect(slot.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
    expect(document.activeElement).not.toBe(slot);
  });

  it('announces politely rather than assertively', () => {
    renderQuestion(reactingIndex);
    const slot = screen.getByTestId('reaction-slot');
    // Polite never interrupts, and a status region never moves focus.
    expect(slot).toHaveAttribute('aria-live', 'polite');
    expect(slot).toHaveAttribute('role', 'status');
  });

  it('clears itself after its window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderQuestion(reactingIndex);
      await user.click(screen.getByTestId('question-option-0'));
      await waitFor(() => expect(screen.getByTestId('reaction')).toBeInTheDocument());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByTestId('reaction')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the consent document is contained', () => {
  function open() {
    __clearPatternCache();
    return render(<Consent onAccept={vi.fn()} onBack={vi.fn()} seed={7} />);
  }

  it('locks the page while it is open, and releases it on close', () => {
    expect(document.body.style.overflow).not.toBe('hidden');

    const view = open();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.dataset.consentOpen).toBe('true');

    view.unmount();
    expect(document.documentElement.style.overflow).not.toBe('hidden');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.body.dataset.consentOpen).toBeUndefined();
  });

  it('bounds the overlay to one viewport', () => {
    open();
    const overlay = screen.getByTestId('consent-backdrop');
    const style = window.getComputedStyle(overlay);
    // 100dvh, not auto height, and it does not scroll itself.
    expect(style.height).toContain('100dvh');
    expect(style.maxHeight).toContain('100dvh');
    expect(style.overflow).toBe('hidden');
    expect(style.position).toBe('fixed');
  });

  it('gives the warning text its own scrolling region', () => {
    open();
    const reading = screen.getByTestId('consent-reading');
    expect(window.getComputedStyle(reading).overflowY).toBe('auto');
  });

  it('keeps the actions outside the scrolling region, so they never scroll away', () => {
    open();
    const reading = screen.getByTestId('consent-reading');
    const actions = screen.getByTestId('consent-actions');
    expect(reading.contains(actions)).toBe(false);
    expect(actions.contains(screen.getByTestId('consent-accept'))).toBe(true);
    expect(actions.contains(screen.getByTestId('consent-back'))).toBe(true);
  });

  it('puts the warning text inside the scrolling region', () => {
    open();
    const reading = screen.getByTestId('consent-reading');
    expect(reading.contains(screen.getByTestId('consent-warning-title'))).toBe(true);
    expect(reading.contains(screen.getByTestId('consent-closing'))).toBe(true);
  });

  it('keeps the heading out of the scrolling region', () => {
    open();
    const reading = screen.getByTestId('consent-reading');
    expect(reading.contains(screen.getByRole('heading', { name: 'Before you start:' }))).toBe(false);
  });

  it('gives the action row an opaque ground so text cannot pass beneath it', () => {
    open();
    const background = window.getComputedStyle(screen.getByTestId('consent-actions')).backgroundColor;
    // Solid, and not tinted red.
    expect(background).not.toBe('');
    expect(background).not.toMatch(/rgba\([^)]*,\s*0(\.\d+)?\)$/);
    expect(background).not.toMatch(/rgb\(\s*(1[0-9]{2}|2[0-9]{2})/);
  });

  it('sits above every glitch layer', () => {
    open();
    const overlay = screen.getByTestId('consent-backdrop');
    const zIndex = Number(window.getComputedStyle(overlay).zIndex);
    // The glitch and CRT layers top out at 95.
    expect(zIndex).toBeGreaterThan(95);
  });

  it('draws the warning on clean black, with no red fill behind the copy', () => {
    open();
    const warning = screen.getByTestId('consent-warning-title').parentElement!;
    const background = window.getComputedStyle(warning).backgroundColor;
    // Transparent: the weight comes from the rules and the heading, not a box.
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(background);
    // No gradient behind the copy either.
    expect(window.getComputedStyle(warning).backgroundImage).toBe('none');
  });
});
