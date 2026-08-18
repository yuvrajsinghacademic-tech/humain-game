import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { About } from '@/features/game/About';
import { Boot } from '@/features/game/Boot';
import { Menu } from '@/features/game/Menu';
import { Settings } from '@/features/game/Settings';
import { MENU_ACCENT_GAP_MS, MENU_SLICE_GAP_MS } from '@/lib/visual/glitchScheduler';
import { MENU_ACCENT_LAYERS } from '@/lib/visual/useGlitch';
import { __clearPatternCache } from '@/lib/visual/clientOnly';

const text = (node: HTMLElement | null): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => {
  __clearPatternCache();
});

describe('the boot screen', () => {
  it('shows a loading bar and no text whatsoever', () => {
    render(<Boot onEnter={vi.fn()} />);
    const bar = screen.getByTestId('boot-bar');
    expect(bar).toBeInTheDocument();

    // Nothing readable on the screen: no percentage, no label, no title, no logo.
    expect(text(document.body)).toBe('');
    expect(document.body.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId('logo')).not.toBeInTheDocument();
  });

  it('exposes the bar to assistive technology without visible text', () => {
    render(<Boot onEnter={vi.fn()} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAccessibleName('Loading');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow');
  });

  it('shows no ENTER button until the bar has finished', () => {
    render(<Boot onEnter={vi.fn()} />);
    expect(screen.queryByTestId('enter')).not.toBeInTheDocument();
  });

  it('advances, completes, and then offers ENTER', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Boot onEnter={vi.fn()} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      const early = Number(screen.getByTestId('boot-bar').getAttribute('aria-valuenow'));
      expect(early).toBeGreaterThan(0);
      expect(early).toBeLessThan(100);

      // Past the longest possible run plus the hold and fade.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(screen.getByTestId('enter')).toHaveTextContent('ENTER');
      expect(screen.queryByTestId('boot-bar')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls back only when ENTER is pressed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onEnter = vi.fn();
      render(<Boot onEnter={onEnter} />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(onEnter).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('enter'));
      expect(onEnter).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is reachable by keyboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onEnter = vi.fn();
      render(<Boot onEnter={onEnter} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      // Focus is moved to ENTER as soon as it exists. Asserted after advancing rather
      // than through waitFor, which does not drive fake timers.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByTestId('enter')).toHaveFocus();

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.keyboard('{Enter}');
      expect(onEnter).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the main menu', () => {
  function open(overrides: Partial<Parameters<typeof Menu>[0]> = {}) {
    const onPlay = overrides.onPlay ?? vi.fn();
    const onMusicChange = overrides.onMusicChange ?? vi.fn();
    render(<Menu onPlay={onPlay} musicOn={overrides.musicOn ?? true} onMusicChange={onMusicChange} />);
    return { onPlay, onMusicChange };
  }

  it('shows the wordmark and the three options', () => {
    open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('hum(ai)n');
    expect(screen.getByTestId('play-now')).toHaveTextContent('PLAY NOW');
    expect(screen.getByTestId('menu-about')).toHaveTextContent('ABOUT');
    expect(screen.getByTestId('menu-settings')).toHaveTextContent('SETTINGS');
  });

  it('no longer offers the old opening button', () => {
    open();
    expect(screen.queryByText(/will you be replaced\?/i)).not.toBeInTheDocument();
  });

  it('renders animated static behind the content, hidden from assistive technology', () => {
    open();
    const canvas = screen.getByTestId('tv-static');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    // Below the menu, which sits at z-index 5.
    expect(Number(window.getComputedStyle(canvas).zIndex)).toBeLessThan(5);
    expect(window.getComputedStyle(canvas).pointerEvents).toBe('none');
  });

  it('freezes the static under reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      open();
      expect(screen.getByTestId('tv-static')).toHaveAttribute('data-frozen', 'true');
    } finally {
      window.matchMedia = original;
    }
  });

  it('starts the transition when PLAY NOW is pressed', async () => {
    const { onPlay } = open();
    await userEvent.click(screen.getByTestId('play-now'));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('closes any popup before playing', async () => {
    const { onPlay } = open();
    await userEvent.click(screen.getByTestId('menu-settings'));
    expect(screen.getByTestId('settings')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('play-now'));
    expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('uses a far calmer glitch schedule than the opening', () => {
    // Accents every 4–8s and a slice every 12–20s, versus the opening's sub-second
    // micro layer. A title screen is looked at for minutes.
    expect(MENU_ACCENT_GAP_MS).toEqual([4000, 8000]);
    expect(MENU_SLICE_GAP_MS).toEqual([12_000, 20_000]);
    expect(MENU_ACCENT_LAYERS).toHaveLength(2);

    const names = MENU_ACCENT_LAYERS.flatMap((layer) => layer.events.map((event) => event.name));
    // None of the destructive effects belong on the title screen.
    for (const banned of ['split', 'bands', 'chroma-hard', 'wrong-logo', 'tear', 'logo-ghost']) {
      expect(names).not.toContain(banned);
    }
  });
});

describe('ABOUT', () => {
  it('shows the copy verbatim', () => {
    render(<About onClose={vi.fn()} />);
    const body = text(screen.getByTestId('about'));
    expect(body).toContain('hum(ai)n is a psychological prediction game.');
    expect(body).toContain(
      'Complete a behavioral assessment, then enter the Prediction Booth. An artificial intelligence named Darry studies how you choose, hesitate, repeat, and switch—then attempts to reproduce your decisions before you make them.',
    );
    expect(body).toContain(
      'Fifteen choices determine whether anything you do still belongs only to you.',
    );
  });

  it('is a labelled modal with a single close action', () => {
    render(<About onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('ABOUT');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('about-back')).toHaveTextContent('BACK');
  });

  it('closes on BACK and on Escape', async () => {
    const onClose = vi.fn();
    render(<About onClose={onClose} />);
    await userEvent.click(screen.getByTestId('about-back'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focuses its close action and traps focus', async () => {
    render(<About onClose={vi.fn()} />);
    const back = screen.getByTestId('about-back');
    await waitFor(() => expect(back).toHaveFocus());
    // Only one stop, so tabbing keeps returning to it.
    await userEvent.tab();
    expect(back).toHaveFocus();
  });

  it('uses an opaque surface so the static cannot interfere', () => {
    render(<About onClose={vi.fn()} />);
    const background = window.getComputedStyle(screen.getByTestId('about')).backgroundColor;
    expect(background).not.toMatch(/rgba\([^)]*,\s*0(\.\d+)?\)$/);
  });
});

describe('SETTINGS', () => {
  function open(overrides: Partial<Parameters<typeof Settings>[0]> = {}) {
    const onMusicChange = overrides.onMusicChange ?? vi.fn();
    const onScareLevelChange = overrides.onScareLevelChange ?? vi.fn();
    render(
      <Settings
        onClose={overrides.onClose ?? vi.fn()}
        musicOn={overrides.musicOn ?? true}
        onMusicChange={onMusicChange}
        scareLevel={overrides.scareLevel ?? 'MEDIUM'}
        onScareLevelChange={onScareLevelChange}
      />,
    );
    return { onMusicChange, onScareLevelChange };
  }

  it('offers music and scare level', () => {
    open();
    expect(screen.getByText('MUSIC')).toBeInTheDocument();
    expect(screen.getByText('SCARE LEVEL')).toBeInTheDocument();
    expect(screen.getByTestId('music-on')).toBeInTheDocument();
    expect(screen.getByTestId('music-off')).toBeInTheDocument();
    for (const level of ['low', 'medium', 'high']) {
      expect(screen.getByTestId(`scare-${level}`)).toBeInTheDocument();
    }
  });

  it('exposes the selected music state', () => {
    open({ musicOn: true });
    expect(screen.getByTestId('music-on')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('music-off')).toHaveAttribute('aria-checked', 'false');
  });

  it('reports a music change without touching anything else', async () => {
    const { onMusicChange, onScareLevelChange } = open({ musicOn: true });
    await userEvent.click(screen.getByTestId('music-off'));
    expect(onMusicChange).toHaveBeenCalledWith(false);
    expect(onScareLevelChange).not.toHaveBeenCalled();
  });

  it('defaults scare level to MEDIUM and exposes the selection', () => {
    open();
    expect(screen.getByTestId('scare-medium')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('scare-medium')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('scare-low')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('scare-high')).toHaveAttribute('aria-checked', 'false');
  });

  it('changes only the visible selection when scare level moves', async () => {
    const { onScareLevelChange, onMusicChange } = open({ scareLevel: 'MEDIUM' });
    await userEvent.click(screen.getByTestId('scare-high'));

    expect(onScareLevelChange).toHaveBeenCalledWith('HIGH');
    // It is presentation only: it must not reach into audio or anything else.
    expect(onMusicChange).not.toHaveBeenCalled();
  });

  it('adds no explanatory text under the scare level', () => {
    open();
    const body = text(screen.getByTestId('settings')).toLowerCase();
    expect(body).not.toContain('no effect');
    expect(body).not.toContain('does nothing');
    expect(body).not.toContain('coming soon');
    // The whole modal is two labels, five options and a close action — nothing else.
    expect(body).toBe('settingsmusiconoffscare levellowmediumhighback');
  });

  it('groups both controls as radio groups', () => {
    open();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('closes on BACK and Escape, and traps focus', async () => {
    const onClose = vi.fn();
    open({ onClose });
    await waitFor(() => expect(screen.getByTestId('settings-back')).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('settings-back'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

/**
 * The site links at the foot of the title screen.
 *
 * A site that shows advertising has to make its policies reachable from the front
 * page, and a player who wants to know what is being measured should not have to
 * guess. The whole difficulty is doing that without putting a fourth option next to
 * PLAY NOW — so these assertions are mostly about the links being *subordinate*
 * rather than about them existing.
 */
describe('the main menu’s site links', () => {
  function open() {
    render(<Menu onPlay={vi.fn()} musicOn onMusicChange={vi.fn()} />);
  }

  it('reaches the project page, the privacy policy and the terms', () => {
    open();
    expect(screen.getByTestId('menu-site-about')).toHaveAttribute('href', '/about');
    expect(screen.getByTestId('menu-site-privacy')).toHaveAttribute('href', '/privacy');
    expect(screen.getByTestId('menu-site-terms')).toHaveAttribute('href', '/terms');
  });

  it('does not call itself ABOUT, which already means the modal', () => {
    open();
    // Two controls one word apart, meaning two different things, would be worse than a
    // slightly longer label.
    expect(screen.getByTestId('menu-site-about')).toHaveTextContent('THE PROJECT');
    expect(screen.getByTestId('menu-about')).toHaveTextContent('ABOUT');
    expect(screen.getAllByRole('button', { name: 'ABOUT' })).toHaveLength(1);
  });

  it('leaves the three options as the only buttons on the screen', () => {
    open();
    // Links, not buttons: they navigate away, and they must not read as game controls
    // to a screen reader any more than they do to an eye.
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('is a separate landmark from the main menu', () => {
    open();
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'About this site' })).toBeInTheDocument();
  });

  it('is drawn smaller and dimmer than the options it sits beneath', () => {
    open();
    const option = window.getComputedStyle(screen.getByTestId('play-now'));
    const link = window.getComputedStyle(screen.getByTestId('menu-site-privacy'));
    expect(parseFloat(link.fontSize)).toBeLessThan(parseFloat(option.fontSize));
    expect(link.color).not.toBe(option.color);
  });

  it('still gives a finger something to hit', () => {
    open();
    // Small type, real target: the padding does the work rather than the font size.
    const link = window.getComputedStyle(screen.getByTestId('menu-site-terms'));
    expect(parseFloat(link.paddingTop)).toBeGreaterThan(0);
  });
});

describe('the scare level persists nothing', () => {
  it('writes no key of its own', async () => {
    const before = Object.keys(window.localStorage);
    render(
      <Settings
        onClose={vi.fn()}
        musicOn
        onMusicChange={vi.fn()}
        scareLevel="MEDIUM"
        onScareLevelChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('scare-high'));
    expect(Object.keys(window.localStorage)).toEqual(before);
  });
});
