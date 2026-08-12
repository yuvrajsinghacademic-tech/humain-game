#!/usr/bin/env node

/**
 * Production security probe.
 *
 * Checks a deployed instance from the outside: delivery, headers, and the rejection
 * paths. It is designed to run every day forever, which imposes one hard rule —
 *
 *   **No request here may reach the OpenAI authorization boundary.**
 *
 * Every API request this makes is rejected by the guard (origin, session, media type,
 * body size) or by schema validation, all of which happen strictly before
 * `authorizeAiCall` is called, and therefore before any paid call is possible. There is
 * no code path in this file that can spend money. The one endpoint that would spend —
 * a valid, same-origin, authenticated `/api/predict` with a well-formed body — is
 * deliberately never constructed.
 *
 * Usage:
 *   node scripts/production-probe.mjs https://example.com [--json]
 *
 * Exit code 0 means every check passed.
 */

import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const BASE = (args.find((a) => !a.startsWith('--')) ?? '').replace(/\/+$/, '');

if (!BASE) {
  console.error('usage: node scripts/production-probe.mjs <base-url> [--json]');
  process.exit(2);
}

const ORIGIN = new URL(BASE).origin;
const TIMEOUT_MS = 20_000;
const AUDIO = '/audio/menu-static.m4a';

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail });

/** One request, with a deadline, never throwing. */
async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal, redirect: 'manual' });
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* a body is optional */
    }
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    return { status: 0, headers: new Headers(), body: '', error: String(error?.name ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

const json = (path, body, headers = {}) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

// ---------------------------------------------------------------------------
// Public delivery
// ---------------------------------------------------------------------------

const home = await request('/');
record('homepage returns 200', home.status === 200, `status ${home.status}`);

const audio = await request(AUDIO);
record('audio returns 200', audio.status === 200, `status ${audio.status}`);
record(
  'audio is served as audio/mp4',
  (audio.headers.get('content-type') ?? '').includes('audio/mp4'),
  audio.headers.get('content-type') ?? '(no content-type)',
);

const ranged = await request(AUDIO, { headers: { Range: 'bytes=0-1023' } });
record('audio range request returns 206', ranged.status === 206, `status ${ranged.status}`);
record(
  'audio advertises range support',
  (ranged.headers.get('accept-ranges') ?? '') === 'bytes',
  ranged.headers.get('accept-ranges') ?? '(absent)',
);

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const csp = home.headers.get('content-security-policy') ?? '';
record('CSP is present', csp.length > 0, csp ? 'present' : 'absent');
record("CSP contains media-src 'self'", csp.includes("media-src 'self'"), csp.includes("media-src") ? 'media-src present' : 'no media-src');
record("CSP does not contain media-src 'none'", !csp.includes("media-src 'none'"), 'checked');
record("CSP restricts connect-src to 'self'", csp.includes("connect-src 'self'"), 'checked');
record('CSP does not grant unsafe-eval in production', !csp.includes('unsafe-eval'), 'checked');

record(
  'HSTS is present',
  (home.headers.get('strict-transport-security') ?? '').includes('max-age='),
  home.headers.get('strict-transport-security') ?? '(absent)',
);
record(
  'X-Content-Type-Options is nosniff',
  (home.headers.get('x-content-type-options') ?? '') === 'nosniff',
  home.headers.get('x-content-type-options') ?? '(absent)',
);
record(
  'a referrer policy is set',
  (home.headers.get('referrer-policy') ?? '').length > 0,
  home.headers.get('referrer-policy') ?? '(absent)',
);
record(
  'clickjacking protection is present',
  Boolean(home.headers.get('x-frame-options')) || csp.includes("frame-ancestors 'none'"),
  home.headers.get('x-frame-options') ?? (csp.includes('frame-ancestors') ? "frame-ancestors 'none'" : '(absent)'),
);
record(
  'a permissions policy is set',
  (home.headers.get('permissions-policy') ?? '').length > 0,
  home.headers.get('permissions-policy') ?? '(absent)',
);
record(
  'no wildcard CORS',
  (home.headers.get('access-control-allow-origin') ?? '') !== '*',
  home.headers.get('access-control-allow-origin') ?? '(no CORS header, as expected)',
);

// ---------------------------------------------------------------------------
// Rejection paths — all of these fail before AI authorization
// ---------------------------------------------------------------------------

/**
 * A body that is schema-valid in shape but can never be authorized, because every
 * request below is rejected by the guard first. Kept minimal on purpose.
 */
const shape = { gameId: 'probe0000', round: 1 };

const crossOrigin = await json('/api/predict', shape, { origin: 'https://probe.invalid' });
record('cross-origin request is rejected', crossOrigin.status === 403, `status ${crossOrigin.status}`);

const noSession = await json('/api/predict', shape);
record(
  'missing-session request is rejected',
  noSession.status === 401,
  `status ${noSession.status}`,
);

const malformed = await json('/api/predict', '{"gameId":');
record('malformed JSON is rejected', malformed.status === 400 || malformed.status === 401, `status ${malformed.status}`);

const wrongType = await json('/api/predict', shape, { 'content-type': 'text/plain' });
record(
  'a non-JSON content type is rejected',
  wrongType.status === 415 || wrongType.status === 401,
  `status ${wrongType.status}`,
);

// Oversized: refused on size, or by the guard, before anything is parsed or authorized.
const oversized = await json('/api/predict', { ...shape, pad: 'x'.repeat(200_000) });
record(
  'oversized body is rejected before AI authorization',
  [413, 401, 400, 0].includes(oversized.status),
  `status ${oversized.status}${oversized.error ? ` (${oversized.error})` : ''}`,
);

const badMethod = await request('/api/predict', { method: 'GET', headers: { origin: ORIGIN } });
record('GET on a POST-only route is rejected', badMethod.status === 405, `status ${badMethod.status}`);

// ---------------------------------------------------------------------------
// Error bodies must reveal nothing
// ---------------------------------------------------------------------------

const errorBodies = [crossOrigin, noSession, malformed, wrongType, badMethod]
  .map((r) => r.body ?? '')
  .join('\n');

const FORBIDDEN = [
  'openai',
  'upstash',
  'redis',
  'GAME_SEAL',
  'node_modules',
  '/Users/',
  '/var/task',
  'at Object.',
  'at async',
  '.ts:',
  'ENOENT',
  'stack',
];
const leaked = FORBIDDEN.filter((needle) => errorBodies.toLowerCase().includes(needle.toLowerCase()));
record('error bodies expose no internals', leaked.length === 0, leaked.length ? `found ${leaked.join(', ')}` : 'clean');

const apiCacheable = (noSession.headers.get('cache-control') ?? '').includes('no-store');
record('API responses are uncacheable', apiCacheable, noSession.headers.get('cache-control') ?? '(absent)');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`production probe — ${BASE}\n`);
  for (const { name, pass, detail } of results) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
}

/**
 * Make a value from the network safe to put in a rendered summary.
 *
 * `detail` often quotes a response header, and the step summary is Markdown that
 * GitHub renders — so a header from a host that is not behaving could inject markup
 * into the run page, or simply be long enough to bury the result. CodeQL flagged the
 * unsanitized path (`js/http-to-file-access`) and it was right to. Control characters
 * go, the Markdown and HTML significant characters go, and the length is capped. The
 * unabridged value is still in the job log, which is plain text.
 */
function summarySafe(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[`*_[\]<>|#\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `### Production probe: ${failed.length === 0 ? 'pass' : `**${failed.length} failure(s)**`}`,
    '',
    // The target comes from repository configuration rather than from a response, but
    // it is scrubbed too: there is no reason for this line to be the exception.
    `Target: \`${summarySafe(BASE)}\` — ${results.length - failed.length}/${results.length} checks passed.`,
    '',
    'No request in this probe can reach the OpenAI authorization boundary.',
  ];
  // `name` is a literal from this file; only `detail` can carry remote content.
  for (const { name, detail } of failed) lines.push(`- **${name}** — ${summarySafe(detail)}`);
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  } catch {
    /* a summary is a nicety, never a failure */
  }
}

process.exit(failed.length === 0 ? 0 : 1);
