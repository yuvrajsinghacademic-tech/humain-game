import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareResult } from '@/features/ending/ShareResult';
import { Ending } from '@/features/ending/Ending';
import { TOTAL_ROUNDS } from '@/lib/behavior/scoring';
import { buildRounds } from './factories';

/**
 * The share control, and where it sits.
 *
 * Two properties are being defended. The obvious one is that sharing works on both
 * paths — the device's own share sheet where there is one, the clipboard everywhere
 * else — including the browsers where `navigator.share` is missing entirely, which is
 * most desktops.
 *
 * The one that matters more is *when* it appears. The ending is the whole piece
 * landing, and the reveal has to be allowed to land before the screen admits it is on
 * a website. So the aftermath is asserted to be absent while the verdict and the
 * percentages are arriving, and present only afterwards.
 */

const result = { darry: 73, you: 27, correct: 11, rounds: 15 };

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setNavigator(property: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

function restore(property: 'share' | 'clipboard', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(navigator, property, descriptor);
  else delete (navigator as unknown as Record<string, unknown>)[property];
}

beforeEach(() => {
  restore('share', undefined);
  restore('clipboard', undefined);
});

afterEach(() => {
  cleanup();
  restore('share', originalShare);
  restore('clipboard', originalClipboard);
});

describe('with no Web Share API', () => {
  it('offers copying, and only copying', () => {
    render(<ShareResult result={result} />);
    expect(screen.getByTestId('share-copy')).toBeInTheDocument();
    // Desktop Safari and most desktop browsers land here.
    expect(screen.queryByTestId('share-native')).not.toBeInTheDocument();
  });

  it('writes the share text to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator('clipboard', { writeText });

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('11 of my 15 choices');
    expect(copied).toContain('willyoubereplaced.com');

    await waitFor(() => expect(screen.getByTestId('share-status')).toHaveTextContent('Copied.'));
  });

  it('falls back to a selection copy when the clipboard API is refused', async () => {
    setNavigator('clipboard', {
      writeText: vi.fn().mockRejectedValue(new Error('denied')),
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-copy'));

    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    await waitFor(() => expect(screen.getByTestId('share-status')).toHaveTextContent('Copied.'));
    // The scratch element used to hold the selection must not be left behind.
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('says plainly when copying is impossible, rather than claiming success', async () => {
    setNavigator('clipboard', undefined);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-copy'));

    await waitFor(() => expect(screen.getByTestId('share-status')).toHaveTextContent(/blocked/i));
  });
});

describe('with the Web Share API', () => {
  it('offers both, and hands the sheet a title, a text and a URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator('share', share);

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-native'));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0] as Record<string, string>;
    expect(Object.keys(payload).sort()).toEqual(['text', 'title', 'url']);
    expect(payload.url).toBe('https://www.willyoubereplaced.com/');
    expect(payload.text).toContain('11 of my 15 choices');
  });

  it('treats a dismissed sheet as nothing at all', async () => {
    // Cancelling is by far the most common outcome and is not a failure. Nothing on
    // screen may change, and nothing may be thrown.
    setNavigator('share', vi.fn().mockRejectedValue(new DOMException('Abort', 'AbortError')));

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-native'));

    await waitFor(() => expect(screen.getByTestId('share-status')).toHaveTextContent(''));
  });

  it('never requests a permission', async () => {
    const request = vi.fn();
    Object.defineProperty(navigator, 'permissions', {
      value: { request, query: request },
      configurable: true,
    });
    setNavigator('share', vi.fn().mockResolvedValue(undefined));

    render(<ShareResult result={result} />);
    await userEvent.click(screen.getByTestId('share-native'));
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the share control is labelled and reachable', () => {
  it('announces its result politely', () => {
    render(<ShareResult result={result} />);
    const status = screen.getByTestId('share-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('role', 'status');
  });

  it('is operable from the keyboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator('clipboard', { writeText });

    render(<ShareResult result={result} />);
    screen.getByTestId('share-copy').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });
});

describe('where the aftermath sits in the ending', () => {
  const rounds = buildRounds('A'.repeat(TOTAL_ROUNDS), '1'.repeat(TOTAL_ROUNDS));

  it('is absent while the verdict is still landing', async () => {
    render(<Ending rounds={rounds} report={null} onPlayAgain={vi.fn()} />);

    // The moment the verdict appears, none of this may be on screen with it.
    await waitFor(() => expect(screen.getByTestId('verdict-line')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.queryByTestId('aftermath')).not.toBeInTheDocument();
    expect(screen.queryByTestId('share-result')).not.toBeInTheDocument();
    expect(screen.queryByTestId('play-again')).not.toBeInTheDocument();
  });

  it('arrives only after the two percentages', async () => {
    render(<Ending rounds={rounds} report={null} onPlayAgain={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('final-numbers')).toBeInTheDocument(), {
      timeout: 5000,
    });
    await waitFor(() => expect(screen.getByTestId('aftermath')).toBeInTheDocument(), {
      timeout: 5000,
    });

    // And the verdict is still there — the aftermath is added below it, not swapped in.
    expect(screen.getByTestId('verdict-line')).toBeInTheDocument();
    expect(screen.getByTestId('final-numbers')).toBeInTheDocument();
    expect(screen.getByTestId('share-result')).toBeInTheDocument();
    expect(screen.getByTestId('play-again')).toBeInTheDocument();
  });

  it('carries no advertising while none is configured', async () => {
    render(<Ending rounds={rounds} report={null} onPlayAgain={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('aftermath')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.queryByTestId('ad-postgame')).not.toBeInTheDocument();
    expect(document.querySelector('ins.adsbygoogle')).toBeNull();
  });

  it('puts the score on screen but never the share text', async () => {
    render(<Ending rounds={rounds} report={null} onPlayAgain={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('aftermath')).toBeInTheDocument(), {
      timeout: 5000,
    });
    // The text is composed at the moment of the press, not rendered and waiting. A
    // preview block would put a second copy of the numbers under the verdict and
    // dilute it.
    expect(document.body.textContent).not.toContain('Think you are harder to read');
  });
});
