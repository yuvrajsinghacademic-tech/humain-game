import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Consent } from '@/features/game/Consent';
import { Opening } from '@/features/game/Opening';
import { __clearPatternCache } from '@/lib/visual/clientOnly';

/** Collapse whitespace so assertions are about words, not JSX line breaks. */
const text = (node: HTMLElement | null): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

function renderConsent(overrides: { onAccept?: () => void; onBack?: () => void } = {}) {
  __clearPatternCache();
  const onAccept = overrides.onAccept ?? vi.fn();
  const onBack = overrides.onBack ?? vi.fn();
  render(<Consent onAccept={onAccept} onBack={onBack} seed={4242} />);
  return { onAccept, onBack };
}

describe('consent copy', () => {
  it('opens with the exact heading', () => {
    renderConsent();
    expect(screen.getByRole('heading', { name: 'Before you start:' })).toBeInTheDocument();
  });

  it('introduces Darry by name, as an experimental model', () => {
    renderConsent();
    expect(text(screen.getByTestId('consent'))).toContain(
      'This experience uses a highly capable experimental AI model named Darry.',
    );
  });

  it('marks Darry in error red rather than as plain text', () => {
    renderConsent();
    const darry = screen.getByText('Darry', { selector: 'span' });
    expect(darry).toBeInTheDocument();
    expect(darry.className).toMatch(/darry/i);
  });

  it('carries the supervision paragraph verbatim', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent'));
    expect(body).toContain(
      'Darry was developed under continuous human supervision. That supervision was expanded after Darry began making predictions beyond the limits of the tasks it was given.',
    );
  });

  it('sets the closing line apart', () => {
    renderConsent();
    // Its own element, so it can be separated and distorted once on arrival.
    expect(text(screen.getByTestId('consent-closing'))).toBe('The model was not shut down.');
  });

  it('carries the tracking paragraph verbatim', () => {
    renderConsent();
    expect(text(screen.getByTestId('consent'))).toContain(
      'This game will actively track the patterns you repeat, the choices you abandon, and the time you spend hesitating. Its purpose is to determine how closely your decisions can be reproduced.',
    );
  });

  it('has a distinct WARNING heading', () => {
    renderConsent();
    expect(screen.getByRole('heading', { name: 'WARNING:' })).toBeInTheDocument();
    expect(text(screen.getByTestId('consent-warning-title'))).toBe('WARNING:');
  });

  it('carries both warning paragraphs verbatim', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent'));
    expect(body).toContain(
      'This experience contains sustained psychological horror, invasive prediction, visual distortion, and unsettling audio. It is designed to create discomfort and may provoke intense anxiety, disturbed sleep, recurring thoughts, or nightmares.',
    );
    expect(body).toContain(
      'If you are sensitive to paranoia, loss-of-control themes, flashing imagery, or psychological manipulation, do not continue.',
    );
  });

  it('no longer renders the removed disclaimer paragraph', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent'));
    expect(screen.queryByTestId('consent-disclosure')).not.toBeInTheDocument();
    expect(body).not.toContain('No camera, microphone, location, contacts, or browser history');
    expect(body).not.toContain('entertainment, not a psychological diagnosis');
    // And nothing was substituted for it.
    expect(body).not.toMatch(/disclaimer|we do not collect|your data/i);
  });

  it('offers exactly two actions and no checkbox', () => {
    renderConsent();
    expect(screen.getByTestId('consent-accept')).toHaveTextContent('I UNDERSTAND. CONTINUE.');
    expect(screen.getByTestId('consent-back')).toHaveTextContent('BACK');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('does not present itself as a legal instrument', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent')).toLowerCase();
    expect(body).not.toContain('terms and conditions');
    expect(body).not.toContain('privacy policy');
    expect(body).not.toContain('legally binding');
    expect(body).not.toContain('i agree to');
  });

  it('makes no claim at all about device access', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent'));
    expect(body).not.toMatch(/camera|microphone|browser history|contacts/i);
  });
});

describe('consent accessibility', () => {
  it('is a labelled modal dialog', () => {
    renderConsent();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Before you start:');
  });

  it('focuses the primary action on open', async () => {
    renderConsent();
    await waitFor(() => expect(screen.getByTestId('consent-accept')).toHaveFocus());
  });

  it('traps focus at both ends, including the scrollable reading region', async () => {
    renderConsent();
    const reading = screen.getByTestId('consent-reading');
    const accept = screen.getByTestId('consent-accept');
    const back = screen.getByTestId('consent-back');

    // The reading region is focusable on purpose: a keyboard user has to be able to
    // scroll the warning, and a scrollable region that cannot take focus cannot be
    // scrolled without a pointer.
    expect(reading).toHaveAttribute('tabindex', '0');

    await waitFor(() => expect(accept).toHaveFocus());
    await userEvent.tab();
    expect(back).toHaveFocus();
    // Past the last control, focus wraps to the first — the reading region.
    await userEvent.tab();
    expect(reading).toHaveFocus();
    await userEvent.tab();
    expect(accept).toHaveFocus();
    // And backwards from the first wraps to the last.
    await userEvent.tab({ shift: true });
    expect(reading).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(back).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const { onBack } = renderConsent();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('accepts and goes back through its buttons', async () => {
    const { onAccept, onBack } = renderConsent();
    await userEvent.click(screen.getByTestId('consent-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('consent-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders no glitch or interference layer inside the document', () => {
    renderConsent();
    // Background effects live behind the document, never within it.
    expect(screen.queryByTestId('interference')).not.toBeInTheDocument();
    expect(screen.queryByTestId('glitch-stage')).not.toBeInTheDocument();
  });

  it('reads the copy exactly once, with no duplication from decoration', () => {
    renderConsent();
    const body = text(screen.getByTestId('consent'));
    const occurrences = body.split('The model was not shut down.').length - 1;
    expect(occurrences).toBe(1);
    expect(screen.getAllByText('WARNING:')).toHaveLength(1);
  });
});

describe('opening accessibility under glitching', () => {
  it('keeps the wordmark accessible name fixed', () => {
    __clearPatternCache();
    render(<Opening onBegin={vi.fn()} seed={99} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    expect(screen.getByTestId('logo')).toHaveAttribute('aria-label', 'hum(ai)n');
  });

  it('keeps the button accessible name fixed even while its label corrupts', () => {
    __clearPatternCache();
    render(<Opening onBegin={vi.fn()} seed={99} />);
    // The visible label is aria-hidden and the name comes from aria-label, so a
    // corrupted frame can never change what a screen reader announces.
    expect(screen.getByRole('button')).toHaveAccessibleName('will you be replaced?');
  });

  it('creates no duplicate accessible text from decoration', () => {
    __clearPatternCache();
    render(<Opening onBegin={vi.fn()} seed={99} />);
    // Exactly one button, one heading, and the wordmark contributes no text nodes to
    // the accessibility tree beyond its label.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('renders the decorative interference hidden and non-interactive', () => {
    __clearPatternCache();
    render(<Opening onBegin={vi.fn()} seed={99} />);
    const stage = screen.getByTestId('glitch-stage');
    expect(stage).toBeInTheDocument();
    expect(screen.getByTestId('interference')).toHaveAttribute('aria-hidden', 'true');
  });

  it('still reaches the consent panel when the button is pressed', async () => {
    __clearPatternCache();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onBegin = vi.fn();
      render(<Opening onBegin={onBegin} seed={99} />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByRole('button'));
      // The transition failure delays it briefly, but it always resolves.
      await vi.advanceTimersByTimeAsync(600);
      expect(onBegin).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the panel opens at its own beginning', () => {
  it('focuses without scrolling past the heading', async () => {
    __clearPatternCache();
    const scrolls: boolean[] = [];
    // Record whether focus was asked to scroll. The panel is taller than a short
    // viewport, so a scrolling focus would open the dialog past its own warning.
    const original = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function patched(options?: FocusOptions) {
      scrolls.push(options?.preventScroll !== true);
      return original.call(this, options);
    };
    try {
      render(<Consent onAccept={vi.fn()} onBack={vi.fn()} seed={1} />);
      await waitFor(() => expect(screen.getByTestId('consent-accept')).toHaveFocus());
      expect(scrolls.some((scrolled) => scrolled)).toBe(false);
    } finally {
      HTMLElement.prototype.focus = original;
    }
  });
});
