#!/usr/bin/env node

/**
 * Repository security invariants.
 *
 * Eighteen rules that must hold for every commit. Each one exists because it was
 * either found broken during an audit or is the kind of thing that regresses quietly:
 * a `NEXT_PUBLIC_` prefix creeping onto a secret, an `.env` file slipping past
 * `.gitignore`, a fail-closed guard turning into a fail-open one during a refactor.
 *
 * Two rules about the rules:
 *
 *  - **A matched secret is never printed.** A violation reports a rule id, a file and
 *    a line number. Printing the match would put the secret in a CI log, which is a
 *    worse outcome than the one being prevented.
 *  - **Unknown is not the same as safe.** A rule that cannot be evaluated says so and
 *    fails, rather than passing quietly. The build-output rules are the exception:
 *    they are explicitly skipped when there is no build to inspect, and the skip is
 *    reported.
 *
 * Usage:
 *   node scripts/security-invariants.mjs [--root <dir>] [--json] [--allow-missing-build]
 *
 * Exit code 0 means every rule held.
 */

import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};

const ROOT = value('root', process.cwd());
const AS_JSON = flag('json');
const ALLOW_MISSING_BUILD = flag('allow-missing-build');

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

/**
 * Paths git would never track. Used only when `git ls-files` is unavailable — on a
 * machine without a working git, or when scanning a fixture tree that is not a repo.
 */
const NEVER_TRACKED = [
  /^node_modules(\/|$)/,
  /^\.next(\/|$)/,
  /^out(\/|$)/,
  /^build(\/|$)/,
  /^coverage(\/|$)/,
  /^test-results(\/|$)/,
  /^playwright-report(\/|$)/,
  /^blob-report(\/|$)/,
  /^playwright\/\.cache(\/|$)/,
  /^screenshots(\/|$)/,
  /^\.git(\/|$)/,
  /^\.vercel(\/|$)/,
  /\.DS_Store$/,
  /\.tsbuildinfo$/,
  /^next-env\.d\.ts$/,
];

function walk(dir, into = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (NEVER_TRACKED.some((pattern) => pattern.test(rel))) continue;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, into);
    else into.push(rel);
  }
  return into;
}

/**
 * The file set the rules run over.
 *
 * `git ls-files` is authoritative when it works, because "tracked" is the property
 * most of these rules are really about. The filesystem walk is the fallback, and it
 * is deliberately *wider* than git would be — scanning a file git ignores can only
 * produce a false alarm, never a missed secret.
 */
function collectFiles() {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = out.split('\0').filter(Boolean);
    if (files.length) return { files, source: 'git ls-files' };
  } catch {
    /* no repository, or no usable git: fall through */
  }
  return { files: walk(ROOT), source: 'filesystem walk' };
}

const { files: FILES, source: FILE_SOURCE } = collectFiles();

const BINARY = /\.(m4a|mp4|mov|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|pdf)$/i;

const textFiles = FILES.filter((f) => !BINARY.test(f));

const cache = new Map();
function read(file) {
  if (!cache.has(file)) {
    try {
      cache.set(file, readFileSync(join(ROOT, file), 'utf8'));
    } catch {
      cache.set(file, null);
    }
  }
  return cache.get(file);
}

/** Report a pattern's location without ever reporting what it matched. */
function locate(file, pattern) {
  const text = read(file);
  if (text === null) return [];
  const found = [];
  text.split('\n').forEach((line, index) => {
    if (pattern.test(line)) found.push(index + 1);
  });
  return found;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const violations = [];
const skipped = [];

const fail = (rule, file, line, detail) => violations.push({ rule, file, line, detail });
const skip = (rule, why) => skipped.push({ rule, why });

/** Files that are allowed to contain obviously-fake credential material. */
const FIXTURE_ALLOWLIST = [
  /^tests\//,
  /^e2e\//,
  /^scripts\/security-invariants\.mjs$/,
  /^playwright\.config\.ts$/,
  /^SECURITY\.md$/,
  /^README\.md$/,
];
const isFixture = (file) => FIXTURE_ALLOWLIST.some((pattern) => pattern.test(file));

// ---------------------------------------------------------------------------
// 1. Environment files
// ---------------------------------------------------------------------------

for (const file of FILES) {
  const base = file.split('/').pop();
  if (!/^\.env($|\.)/.test(base)) continue;
  if (file === '.env.example') continue;
  fail('ENV-TRACKED', file, null, 'an environment file other than .env.example is tracked');
}

if (existsSync(join(ROOT, '.env.example'))) {
  const text = read('.env.example') ?? '';
  text.split('\n').forEach((line, index) => {
    // A key with anything after the `=` is a value that should not be in a template.
    if (/^\s*[A-Z][A-Z0-9_]*\s*=\s*\S/.test(line)) {
      fail('ENV-EXAMPLE-EMPTY', '.env.example', index + 1, 'the template carries a value');
    }
  });
}

// ---------------------------------------------------------------------------
// 2-4. Credential material in tracked files
// ---------------------------------------------------------------------------

/** A real OpenAI key is long. The 22-character `sk-test-…` fixtures are not keys. */
const OPENAI_KEY = /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/;
const UPSTASH_TOKEN = /\b[A-Za-z0-9_-]{8,}\.upstash\.io\b|\bA[A-Za-z0-9_-]{60,}=*\b/;
const SEAL_MATERIAL = /GAME_SEAL_SECRET\s*[:=]\s*['"][^'"]{16,}['"]/;

for (const file of textFiles) {
  if (file === 'package-lock.json') continue; // integrity hashes, not credentials

  for (const line of locate(file, OPENAI_KEY)) {
    fail('SECRET-OPENAI', file, line, 'a value shaped like an OpenAI API key');
  }

  if (!isFixture(file)) {
    for (const line of locate(file, UPSTASH_TOKEN)) {
      fail('SECRET-UPSTASH', file, line, 'a value shaped like an Upstash credential');
    }
    for (const line of locate(file, SEAL_MATERIAL)) {
      fail('SECRET-SEAL', file, line, 'a hard-coded sealing secret');
    }
  }
}

// ---------------------------------------------------------------------------
// 5-6. The client/server boundary
// ---------------------------------------------------------------------------

const clientFiles = textFiles.filter(
  (f) => /^src\/.*\.(ts|tsx)$/.test(f) && /^\s*['"]use client['"]/m.test(read(f) ?? ''),
);

for (const file of clientFiles) {
  for (const line of locate(file, /OPENAI_API_KEY/)) {
    fail('CLIENT-OPENAI-ENV', file, line, 'a client component references the OpenAI key');
  }
  // A type-only import is erased at build time and cannot pull the SDK into a bundle.
  const runtimeImport = /^\s*import\s+(?!type\b)[^;]*from\s+['"](openai|@\/lib\/ai(\/[^'"]*)?|@\/lib\/security\/(env|seal|session|counters|ratelimit|guard))['"]/;
  for (const line of locate(file, runtimeImport)) {
    fail('CLIENT-SERVER-IMPORT', file, line, 'a client component imports a server-only module');
  }
}

/**
 * Modules that must refuse to be imported by a client component.
 *
 * An explicit list rather than a directory sweep: `ai/prompts.ts` and `ai/schemas.ts`
 * hold no credentials and touch no crypto, and the request schemas are legitimately
 * shareable, so demanding the guard there would be wrong. What is listed here is the
 * set that reads `process.env`, derives a key, or gates a request.
 */
const MUST_BE_SERVER_ONLY = [
  'src/lib/ai/client.ts',
  'src/lib/ai/index.ts',
  'src/lib/security/env.ts',
  'src/lib/security/seal.ts',
  'src/lib/security/session.ts',
  'src/lib/security/counters.ts',
  'src/lib/security/ratelimit.ts',
  'src/lib/security/guard.ts',
  'src/lib/security/http.ts',
];

for (const file of MUST_BE_SERVER_ONLY) {
  if (!FILES.includes(file)) {
    fail('SERVER-ONLY-GUARD', file, null, 'a module that must be server-only is missing');
    continue;
  }
  if (!/^import 'server-only';$/m.test(read(file) ?? '')) {
    fail('SERVER-ONLY-GUARD', file, null, "the import 'server-only' guard was removed");
  }
}

// ---------------------------------------------------------------------------
// 7. Public environment variables must not look like secrets
// ---------------------------------------------------------------------------

const PUBLIC_SECRET = /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE)/;

/*
 * Scoped to what actually ships. `NEXT_PUBLIC_` matters because Next inlines it into
 * the browser bundle, and only application source, the build config and the env
 * template can cause that — a test naming one is not a leak, and `BUILD-SECRET-NAME`
 * scans the real bundle regardless, so nothing is lost by not scanning tests here.
 */
const SHIPPED = textFiles.filter(
  (f) => f.startsWith('src/') || f === 'next.config.ts' || /^\.env/.test(f),
);
for (const file of SHIPPED) {
  for (const line of locate(file, PUBLIC_SECRET)) {
    fail('PUBLIC-ENV-SECRET', file, line, 'a secret-looking name is exposed to the browser');
  }
}

// ---------------------------------------------------------------------------
// 8-9. Development switches must not be on in production configuration
// ---------------------------------------------------------------------------

/**
 * Files that shape a production deployment. Test configuration is excluded on
 * purpose: `playwright.config.ts` sets `MOCK_AI=true` so the suite never spends, which
 * is correct.
 */
const PRODUCTION_CONFIG = ['.env.example', 'next.config.ts', 'package.json', 'vercel.json'].filter(
  (f) => FILES.includes(f),
);

for (const file of PRODUCTION_CONFIG) {
  for (const line of locate(file, /MOCK_AI\s*[:=]\s*['"]?true/i)) {
    fail('PROD-MOCK-AI', file, line, 'the deterministic stand-in model is switched on');
  }
  for (const line of locate(file, /NEXT_PUBLIC_ALLOW_SEED\s*[:=]\s*['"]?true/i)) {
    fail('PROD-ALLOW-SEED', file, line, 'the seed override is switched on');
  }
}

// ---------------------------------------------------------------------------
// 10-12. Assets
// ---------------------------------------------------------------------------

for (const file of FILES) {
  if (/\.mov$/i.test(file)) {
    fail('TRACKED-MOV', file, null, 'a source recording is tracked; ship only extracted audio');
  }
  if (/game-ambience\.m4a$/.test(file)) {
    fail('ASSET-AMBIENCE', file, null, 'the retired second audio track is back');
  }
}

const audioDir = join(ROOT, 'public', 'audio');
if (existsSync(audioDir)) {
  const shipped = readdirSync(audioDir).filter((f) => f !== '.DS_Store');
  if (shipped.length !== 1 || shipped[0] !== 'menu-static.m4a') {
    fail(
      'ASSET-AUDIO-SET',
      'public/audio',
      null,
      `expected only menu-static.m4a, found ${shipped.length} file(s)`,
    );
  }
} else {
  fail('ASSET-AUDIO-SET', 'public/audio', null, 'the audio directory is missing');
}

// ---------------------------------------------------------------------------
// 13. Behavioural persistence must not return
// ---------------------------------------------------------------------------

/**
 * The game holds its behavioural profile in memory only. One key may be written, and
 * it is a UI preference. Anything else writing to storage is a regression.
 */
const ALLOWED_STORAGE_KEYS = /humain\.audio\.muted|MUTE_KEY|AUDIO_PREFERENCE_KEY|key/;
for (const file of textFiles.filter((f) => f.startsWith('src/'))) {
  const text = read(file) ?? '';
  text.split('\n').forEach((line, index) => {
    const write = /(localStorage|sessionStorage|storage)\??\.setItem\(\s*([^,)]*)/.exec(line);
    if (!write) return;
    if (!ALLOWED_STORAGE_KEYS.test(write[2])) {
      fail('STORAGE-PROFILE', file, index + 1, 'a new key is written to browser storage');
    }
  });
  for (const line of locate(file, /indexedDB|document\.cookie\s*=/)) {
    fail('STORAGE-PROFILE', file, line, 'client-side persistence beyond the audio preference');
  }
}

// ---------------------------------------------------------------------------
// 14. Security headers and the content security policy
// ---------------------------------------------------------------------------

const REQUIRED_CSP = [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
  "media-src 'self'",
];
const REQUIRED_HEADERS = [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security',
  'X-Frame-Options',
];

if (!FILES.includes('next.config.ts')) {
  fail('HEADERS-REQUIRED', 'next.config.ts', null, 'the header configuration is missing');
} else {
  const config = read('next.config.ts') ?? '';
  for (const directive of REQUIRED_CSP) {
    if (!config.includes(directive)) {
      const rule = directive === "media-src 'self'" ? 'CSP-MEDIA-SRC' : 'CSP-REQUIRED';
      fail(rule, 'next.config.ts', null, `the policy no longer contains ${directive}`);
    }
  }
  if (config.includes("media-src 'none'")) {
    fail('CSP-MEDIA-SRC', 'next.config.ts', null, "media-src is 'none'; no audio can load");
  }
  for (const header of REQUIRED_HEADERS) {
    if (!config.includes(header)) {
      fail('HEADERS-REQUIRED', 'next.config.ts', null, `${header} is no longer sent`);
    }
  }
  // `unsafe-eval` is granted in development only; a production grant is a finding.
  if (/unsafe-eval/.test(config) && !/isProduction \? '' :/.test(config)) {
    fail('CSP-UNSAFE-EVAL', 'next.config.ts', null, "'unsafe-eval' is not gated to development");
  }
}

// ---------------------------------------------------------------------------
// 15. Redis failure must stay fail-closed
// ---------------------------------------------------------------------------

/**
 * The behavioural proof lives in `tests/failClosed.test.ts`, which spies on the SDK
 * call and requires a count of zero. This rule is the cheap structural companion: it
 * catches a refactor that removes the guards outright, which is the way this property
 * would most plausibly be lost.
 */
const RATELIMIT = 'src/lib/security/ratelimit.ts';
if (!FILES.includes(RATELIMIT)) {
  fail('FAIL-CLOSED', RATELIMIT, null, 'the authorization module is missing');
} else {
  const text = read(RATELIMIT) ?? '';
  const required = [
    ['mustFailClosed()', 'the production-without-Redis guard'],
    ["reason: 'fail_closed'", 'the fail-closed denial'],
    ["reason: 'store_unavailable'", 'the store-failure denial'],
    ['STORE_TIMEOUT_MS', 'the counter-store deadline'],
  ];
  for (const [needle, what] of required) {
    if (!text.includes(needle)) {
      fail('FAIL-CLOSED', RATELIMIT, null, `${what} is gone`);
    }
  }
}

const ENV_MODULE = 'src/lib/security/env.ts';
if (FILES.includes(ENV_MODULE)) {
  const text = read(ENV_MODULE) ?? '';
  if (!/isProduction\(\)\s*&&\s*!redisConfigured\(\)/.test(text)) {
    fail('FAIL-CLOSED', ENV_MODULE, null, 'mustFailClosed no longer keys on production plus Redis');
  }
  if (!/if \(isProduction\(\)\) throw new MissingSecretError\(\)/.test(text)) {
    fail('FAIL-CLOSED', ENV_MODULE, null, 'production may now fall back to the development secret');
  }
}

// ---------------------------------------------------------------------------
// 16-18. The production build output
// ---------------------------------------------------------------------------

const CLIENT_OUTPUT = join(ROOT, '.next', 'static');
if (!existsSync(CLIENT_OUTPUT)) {
  if (ALLOW_MISSING_BUILD) {
    skip('BUILD-*', 'no .next/static to inspect; run `npm run build` first');
  } else {
    fail(
      'BUILD-MISSING',
      '.next/static',
      null,
      'no build to inspect (pass --allow-missing-build to skip)',
    );
  }
} else {
  const bundle = walkAll(CLIENT_OUTPUT);
  const rules = [
    ['BUILD-LOCAL-PATH', /\/Users\/[A-Za-z0-9._-]+\//, 'a local filesystem path'],
    ['BUILD-SECRET-NAME', /OPENAI_API_KEY|GAME_SEAL_SECRET|UPSTASH_REDIS_REST/, 'a credential name'],
    ['BUILD-OPENAI-SDK', /api\.openai\.com|openai\/helpers\/zod/, 'OpenAI SDK code'],
    ['BUILD-SOURCEMAP', /sourceMappingURL/, 'a source map reference'],
  ];
  for (const file of bundle) {
    let text;
    try {
      text = readFileSync(file, 'latin1');
    } catch {
      continue;
    }
    for (const [rule, pattern, what] of rules) {
      if (pattern.test(text)) {
        fail(rule, relative(ROOT, file).split(sep).join('/'), null, `${what} in the client bundle`);
      }
    }
  }
}

function walkAll(dir, into = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkAll(full, into);
    else into.push(full);
  }
  return into;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const summary = {
  ok: violations.length === 0,
  filesScanned: FILES.length,
  fileSource: FILE_SOURCE,
  violations,
  skipped,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`security invariants — ${FILES.length} files via ${FILE_SOURCE}`);
  for (const { rule, why } of skipped) console.log(`  SKIP  ${rule}: ${why}`);
  if (violations.length === 0) {
    console.log('  all 18 invariants hold');
  } else {
    for (const { rule, file, line, detail } of violations) {
      console.log(`  FAIL  [${rule}] ${file}${line ? `:${line}` : ''} — ${detail}`);
    }
    console.log(`\n${violations.length} violation(s). No matched value is printed by design.`);
  }
}

// A one-line verdict in the Actions run summary, so a failure email is legible.
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `### Security invariants: ${summary.ok ? 'pass' : `**${violations.length} violation(s)**`}`,
    '',
    `Scanned ${FILES.length} files via \`${FILE_SOURCE}\`.`,
  ];
  for (const { rule, file, line } of violations) {
    lines.push(`- \`${rule}\` — ${file}${line ? `:${line}` : ''}`);
  }
  for (const { rule, why } of skipped) lines.push(`- _skipped_ \`${rule}\`: ${why}`);
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  } catch {
    /* a summary is a nicety, never a failure */
  }
}

process.exit(violations.length === 0 ? 0 : 1);
