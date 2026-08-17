import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsentControl } from '@/features/editorial/ConsentControl';

/**
 * The advertising privacy control.
 *
 * The failure this is written against is a specific one: a button that looks like a
 * privacy control, is pressed by somebody who wants to exercise a choice, and does
 * nothing. Every assertion below is a way of making that impossible.
 *
 * So the control is required to be *absent* in every case where there is nothing real
 * to drive — no `googlefc`, a `googlefc` that is not an object, a
 * `showRevocationMessage` that is not callable — and it is required not to throw in
 * any of them.
 */

const setGooglefc = (value: unknown) => {
  Object.defineProperty(window, 'googlefc', { value, configurable: true, writable: true });
};

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).googlefc;
  vi.useRealTimers();
});

describe('with no Google consent API present', () => {
  it('renders the honest fallback rather than a control', () => {
    render(<ConsentControl />);
    expect(screen.getByTestId('consent-control-absent')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-control')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not throw, and does not create the API by looking for it', () => {
    expect(() => render(<ConsentControl />)).not.toThrow();
    // A `window.googlefc = window.googlefc || {}` idiom would leave a stub behind and
    // make a later detection succeed against something that does nothing.
    expect((window as unknown as Record<string, unknown>).googlefc).toBeUndefined();
  });

  it('points at the controls that do exist instead of promising one that will', () => {
    render(<ConsentControl />);
    const text = screen.getByTestId('consent-control-absent').textContent ?? '';
    expect(text).toMatch(/no advertising is running/i);
    expect(text).toMatch(/browser and account controls/i);
    // It must not tell anybody a control is going to turn up here on its own.
    expect(text).not.toMatch(/will appear here automatically|once advertising is enabled/i);
  });
});

describe('with a malformed or partial API', () => {
  it.each([
    ['a bare object', {}],
    ['a non-function property', { showRevocationMessage: 'nope' }],
    ['null', null],
    ['a string', 'googlefc'],
    ['an object with only a callback queue', { callbackQueue: [] }],
  ])('treats %s as absent and does not throw', (_label, value) => {
    setGooglefc(value);
    expect(() => render(<ConsentControl />)).not.toThrow();
    expect(screen.getByTestId('consent-control-absent')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-control')).not.toBeInTheDocument();
  });
});

describe('with a real revocation API present', () => {
  it('offers a control named for what it opens', () => {
    setGooglefc({ showRevocationMessage: vi.fn() });
    render(<ConsentControl />);
    const button = screen.getByTestId('consent-control');
    expect(button).toHaveTextContent('PRIVACY AND COOKIE SETTINGS');
    expect(screen.queryByTestId('consent-control-absent')).not.toBeInTheDocument();
  });

  it('calls the provider’s own function, bound to its object', async () => {
    const showRevocationMessage = vi.fn(function (this: unknown) {
      // `this` must be the googlefc object; Google's implementation reads state off it.
      expect(this).toBe((window as unknown as Record<string, unknown>).googlefc);
    });
    setGooglefc({ showRevocationMessage });

    render(<ConsentControl />);
    await userEvent.click(screen.getByTestId('consent-control'));
    expect(showRevocationMessage).toHaveBeenCalledTimes(1);
  });

  it('survives a provider that throws, and says so rather than failing silently', async () => {
    setGooglefc({
      showRevocationMessage: vi.fn(() => {
        throw new Error('funding choices exploded');
      }),
    });

    render(<ConsentControl />);
    await userEvent.click(screen.getByTestId('consent-control'));

    expect(screen.getByTestId('consent-control-failed')).toBeInTheDocument();
    expect(screen.getByTestId('consent-control-failed')).toHaveTextContent(/could not be opened/i);
  });

  it('corrects itself if the API disappears between render and click', async () => {
    setGooglefc({ showRevocationMessage: vi.fn() });
    render(<ConsentControl />);

    delete (window as unknown as Record<string, unknown>).googlefc;
    await userEvent.click(screen.getByTestId('consent-control'));

    // No throw, and the page settles on the truthful state rather than leaving a
    // control on screen that has nothing behind it.
    expect(screen.getByTestId('consent-control-absent')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-control')).not.toBeInTheDocument();
  });

  it('is operable from the keyboard', async () => {
    const showRevocationMessage = vi.fn();
    setGooglefc({ showRevocationMessage });

    render(<ConsentControl />);
    screen.getByTestId('consent-control').focus();
    await userEvent.keyboard('{Enter}');
    expect(showRevocationMessage).toHaveBeenCalledTimes(1);
  });
});

/**
 * The integration is allowed to detect. It is not allowed to install, or to claim a
 * command it cannot document.
 */
describe('the integration does not overreach', () => {
  /*
   * Comments are stripped before any of this is asserted. The component's own
   * documentation names the mistakes it was corrected away from — including the TCF
   * command below — and a check that could not tell prose from code would force that
   * explanation to be deleted, which is the opposite of useful.
   */
  const code = readFileSync('src/features/editorial/ConsentControl.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('loads no script of any kind', () => {
    // Loading an advertising or messaging script on the privacy page in order to make
    // a privacy button appear would be an absurd trade.
    expect(code).not.toMatch(/createElement\(['"]script|next\/script|adsbygoogle/);
    expect(code).not.toMatch(/fundingchoicesmessages|googlesyndication|pagead2/);
  });

  it('never writes to the consent API namespace', () => {
    // `window.googlefc = window.googlefc || {}` would leave a stub that later
    // detection could succeed against, producing a button with nothing behind it.
    expect(code).not.toMatch(/window\.googlefc\s*=/);
    expect(code).not.toMatch(/callbackQueue\.push/);
  });

  it('no longer claims a TCF command that does not exist', () => {
    // `displayConsentUi` is not in the TCF v2 specification. Calling it on a real CMP
    // returns failure and opens nothing — the inert button this component exists to
    // avoid.
    expect(code).not.toContain('displayConsentUi');
    expect(code).not.toContain('__tcfapi');
  });
});

/**
 * The page's own copy has to match what the component can actually do. This is the
 * claim that was wrong before: publishing a message in AdSense does not by itself put
 * a working control on a page that loads no Google script.
 */
describe('the page makes no promise the code cannot keep', () => {
  const page = readFileSync('src/app/privacy-choices/page.tsx', 'utf8');

  it('does not say a control appears as soon as advertising is enabled', () => {
    expect(page).not.toMatch(/a consent control appears immediately below/i);
    expect(page).not.toMatch(/becomes real with no code change/i);
    expect(page).not.toMatch(/will automatically/i);
  });

  it('tells the reader what to do if no control appears', () => {
    expect(page).toMatch(/If advertising is enabled and no control\s+appears here/i);
  });

  it('offers a control that works today, independent of this site', () => {
    expect(page).toContain('myadcenter.google.com');
  });
});
