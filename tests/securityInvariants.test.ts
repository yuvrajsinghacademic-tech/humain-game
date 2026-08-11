import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Tests for the invariant checker itself.
 *
 * A security check that cannot fail is theatre, so each rule is fed a sanitized
 * fixture tree containing the violation it is supposed to catch. Every credential-like
 * string here is deliberately fake and shaped only well enough to trip a pattern.
 *
 * The fixtures are built from a minimal skeleton rather than a copy of the repository,
 * so a test failure points at the rule rather than at unrelated project state.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'security-invariants.mjs');

interface Violation {
  rule: string;
  file: string;
  line: number | null;
  detail: string;
}

interface Report {
  ok: boolean;
  filesScanned: number;
  violations: Violation[];
  skipped: Array<{ rule: string; why: string }>;
}

function run(root: string): Report {
  try {
    const out = execFileSync(
      process.execPath,
      [SCRIPT, '--root', root, '--json', '--allow-missing-build'],
      { encoding: 'utf8' },
    );
    return JSON.parse(out) as Report;
  } catch (error) {
    // A non-zero exit is the expected outcome for a violating fixture; the report is
    // still on stdout.
    const stdout = (error as { stdout?: string }).stdout ?? '';
    return JSON.parse(stdout) as Report;
  }
}

let skeleton: string;

/** The smallest tree that satisfies every rule. Each test perturbs one thing. */
function buildSkeleton(): string {
  const root = mkdtempSync(join(tmpdir(), 'humain-invariants-'));

  mkdirSync(join(root, 'public', 'audio'), { recursive: true });
  writeFileSync(join(root, 'public', 'audio', 'menu-static.m4a'), 'not really audio');

  mkdirSync(join(root, 'src', 'lib', 'ai'), { recursive: true });
  mkdirSync(join(root, 'src', 'lib', 'security'), { recursive: true });
  mkdirSync(join(root, 'src', 'features'), { recursive: true });

  for (const file of ['client.ts', 'index.ts']) {
    writeFileSync(join(root, 'src', 'lib', 'ai', file), "import 'server-only';\nexport const x = 1;\n");
  }
  for (const file of ['env.ts', 'seal.ts', 'session.ts', 'counters.ts', 'guard.ts', 'http.ts']) {
    writeFileSync(
      join(root, 'src', 'lib', 'security', file),
      "import 'server-only';\nexport const x = 1;\n",
    );
  }

  // The two modules whose contents the fail-closed rule inspects.
  writeFileSync(
    join(root, 'src', 'lib', 'security', 'ratelimit.ts'),
    `import 'server-only';
export const STORE_TIMEOUT_MS = 1500;
export async function authorizeAiCall() {
  if (mustFailClosed()) return { allowed: false, reason: 'fail_closed' };
  return { allowed: false, reason: 'store_unavailable' };
}
`,
  );
  writeFileSync(
    join(root, 'src', 'lib', 'security', 'env.ts'),
    `import 'server-only';
export function sealSecret() {
  if (isProduction()) throw new MissingSecretError();
  return DEV;
}
export function mustFailClosed() {
  return isProduction() && !redisConfigured();
}
`,
  );

  writeFileSync(
    join(root, 'next.config.ts'),
    `const csp = [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
  "media-src 'self'",
  \`script-src 'self'\${isProduction ? '' : " 'unsafe-eval'"}\`,
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];
`,
  );

  writeFileSync(join(root, '.env.example'), 'OPENAI_API_KEY=\nGAME_SEAL_SECRET=\nMOCK_AI=\n');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}\n');

  return root;
}

/** Copy the clean skeleton so a test can dirty it in isolation. */
function variant(mutate: (root: string) => void): Report {
  const root = mkdtempSync(join(tmpdir(), 'humain-variant-'));
  cpSync(skeleton, root, { recursive: true });
  mutate(root);
  const report = run(root);
  rmSync(root, { recursive: true, force: true });
  return report;
}

const rules = (report: Report) => report.violations.map((v) => v.rule);

beforeAll(() => {
  skeleton = buildSkeleton();
});

afterAll(() => {
  rmSync(skeleton, { recursive: true, force: true });
});

describe('the clean skeleton', () => {
  it('passes every rule', () => {
    const report = run(skeleton);
    expect(report.violations, JSON.stringify(report.violations)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('reports that it skipped the build rules, rather than passing them silently', () => {
    expect(run(skeleton).skipped.map((s) => s.rule)).toContain('BUILD-*');
  });
});

describe('environment files', () => {
  it('catches a tracked .env', () => {
    const report = variant((root) => writeFileSync(join(root, '.env'), 'OPENAI_API_KEY=x\n'));
    expect(rules(report)).toContain('ENV-TRACKED');
  });

  it('catches a tracked .env.production', () => {
    const report = variant((root) => writeFileSync(join(root, '.env.production'), 'A=1\n'));
    expect(rules(report)).toContain('ENV-TRACKED');
  });

  it('allows the sanitized example', () => {
    expect(rules(run(skeleton))).not.toContain('ENV-TRACKED');
  });

  it('catches a value left in the example', () => {
    const report = variant((root) =>
      writeFileSync(join(root, '.env.example'), 'GAME_SEAL_SECRET=actual-looking-value-here\n'),
    );
    expect(rules(report)).toContain('ENV-EXAMPLE-EMPTY');
  });
});

describe('credential material', () => {
  it('catches an OpenAI key shape', () => {
    const report = variant((root) =>
      // Fake: correct prefix, plausible length, deliberately not a real key.
      writeFileSync(join(root, 'src', 'leak.ts'), `const k = 'sk-${'A1b2C3d4'.repeat(6)}';\n`),
    );
    expect(rules(report)).toContain('SECRET-OPENAI');
  });

  it('catches an Upstash endpoint', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'leak.ts'), "const u = 'https://fake-db-12345.upstash.io';\n"),
    );
    expect(rules(report)).toContain('SECRET-UPSTASH');
  });

  it('catches a hard-coded sealing secret', () => {
    // The literal has to be long enough to look like key material; a short one is
    // correctly ignored, which is why this is built rather than written by hand.
    const fake = 'a'.repeat(44);
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'leak.ts'), `const GAME_SEAL_SECRET = '${fake}';\n`),
    );
    expect(rules(report)).toContain('SECRET-SEAL');
  });

  it('ignores a short quoted value, which cannot be key material', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'leak.ts'), "const GAME_SEAL_SECRET = 'unset';\n"),
    );
    expect(rules(report)).not.toContain('SECRET-SEAL');
  });

  it('never prints the matched value', () => {
    const secret = `sk-${'Z9y8X7w6'.repeat(6)}`;
    const root = mkdtempSync(join(tmpdir(), 'humain-quiet-'));
    cpSync(skeleton, root, { recursive: true });
    writeFileSync(join(root, 'src', 'leak.ts'), `const k = '${secret}';\n`);

    let output = '';
    try {
      execFileSync(process.execPath, [SCRIPT, '--root', root, '--allow-missing-build'], {
        encoding: 'utf8',
      });
    } catch (error) {
      output = ((error as { stdout?: string }).stdout ?? '') + ((error as { stderr?: string }).stderr ?? '');
    }
    rmSync(root, { recursive: true, force: true });

    expect(output).toContain('SECRET-OPENAI');
    expect(output).toContain('src/leak.ts');
    // The whole point: the finding is reported, the value is not.
    expect(output).not.toContain(secret);
  });
});

describe('the client/server boundary', () => {
  const clientFile = (body: string) => (root: string) =>
    writeFileSync(join(root, 'src', 'features', 'Thing.tsx'), `'use client';\n${body}`);

  it('catches a client component reading the OpenAI key', () => {
    const report = variant(clientFile('const k = process.env.OPENAI_API_KEY;\n'));
    expect(rules(report)).toContain('CLIENT-OPENAI-ENV');
  });

  it('catches a client component importing the SDK', () => {
    const report = variant(clientFile("import OpenAI from 'openai';\n"));
    expect(rules(report)).toContain('CLIENT-SERVER-IMPORT');
  });

  it('catches a client component importing a server-only module', () => {
    const report = variant(clientFile("import { sealSecret } from '@/lib/security/env';\n"));
    expect(rules(report)).toContain('CLIENT-SERVER-IMPORT');
  });

  it('permits a type-only import, which is erased at build time', () => {
    const report = variant(clientFile("import type { Thing } from '@/lib/ai/schemas';\n"));
    expect(rules(report)).not.toContain('CLIENT-SERVER-IMPORT');
  });

  it('catches a removed server-only guard', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'lib', 'security', 'seal.ts'), 'export const x = 1;\n'),
    );
    expect(rules(report)).toContain('SERVER-ONLY-GUARD');
  });
});

describe('public environment names', () => {
  it('catches a secret-looking NEXT_PUBLIC variable', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'leak.ts'), 'const k = process.env.NEXT_PUBLIC_OPENAI_API_KEY;\n'),
    );
    expect(rules(report)).toContain('PUBLIC-ENV-SECRET');
  });
});

describe('development switches', () => {
  it('catches MOCK_AI enabled in production configuration', () => {
    const report = variant((root) => writeFileSync(join(root, '.env.example'), 'MOCK_AI=true\n'));
    expect(rules(report)).toContain('PROD-MOCK-AI');
  });

  it('catches the seed override enabled in production configuration', () => {
    const report = variant((root) =>
      writeFileSync(join(root, '.env.example'), 'NEXT_PUBLIC_ALLOW_SEED=true\n'),
    );
    expect(rules(report)).toContain('PROD-ALLOW-SEED');
  });
});

describe('assets', () => {
  it('catches a tracked source recording', () => {
    const report = variant((root) => writeFileSync(join(root, 'source.MOV'), 'video'));
    expect(rules(report)).toContain('TRACKED-MOV');
  });

  it('catches the retired second track returning', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'public', 'audio', 'game-ambience.m4a'), 'audio'),
    );
    expect(rules(report)).toContain('ASSET-AMBIENCE');
    expect(rules(report)).toContain('ASSET-AUDIO-SET');
  });

  it('catches any extra file in the audio directory', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'public', 'audio', 'something-else.m4a'), 'audio'),
    );
    expect(rules(report)).toContain('ASSET-AUDIO-SET');
  });

  it('catches the audio directory disappearing', () => {
    const report = variant((root) => rmSync(join(root, 'public', 'audio'), { recursive: true }));
    expect(rules(report)).toContain('ASSET-AUDIO-SET');
  });
});

describe('behavioural persistence', () => {
  it('catches a new browser-storage key', () => {
    const report = variant((root) =>
      writeFileSync(
        join(root, 'src', 'features', 'store.ts'),
        "localStorage.setItem('humain.profile', JSON.stringify(profile));\n",
      ),
    );
    expect(rules(report)).toContain('STORAGE-PROFILE');
  });

  it('permits the one audio preference', () => {
    const report = variant((root) =>
      writeFileSync(
        join(root, 'src', 'features', 'store.ts'),
        "localStorage.setItem('humain.audio.muted', 'true');\n",
      ),
    );
    expect(rules(report)).not.toContain('STORAGE-PROFILE');
  });

  it('catches indexedDB and cookie writes', () => {
    const report = variant((root) =>
      writeFileSync(join(root, 'src', 'features', 'store.ts'), 'indexedDB.open("humain");\n'),
    );
    expect(rules(report)).toContain('STORAGE-PROFILE');
  });
});

describe('headers and the content security policy', () => {
  it('catches media-src being dropped', () => {
    const report = variant((root) => {
      const path = join(root, 'next.config.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(`"media-src 'self'",`, ''));
    });
    expect(rules(report)).toContain('CSP-MEDIA-SRC');
  });

  it("catches media-src being set back to 'none'", () => {
    const report = variant((root) => {
      const path = join(root, 'next.config.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(`"media-src 'self'"`, `"media-src 'none'"`));
    });
    expect(rules(report)).toContain('CSP-MEDIA-SRC');
  });

  it('catches a required header being removed', () => {
    const report = variant((root) => {
      const path = join(root, 'next.config.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(/Strict-Transport-Security/g, 'Nothing-Much'));
    });
    expect(rules(report)).toContain('HEADERS-REQUIRED');
  });

  it('catches unsafe-eval escaping its development gate', () => {
    const report = variant((root) => {
      const path = join(root, 'next.config.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(/\$\{isProduction \? '' : " 'unsafe-eval'"\}/, " 'unsafe-eval'"));
    });
    expect(rules(report)).toContain('CSP-UNSAFE-EVAL');
  });
});

describe('fail-closed spending', () => {
  it('catches the production-without-Redis guard being removed', () => {
    const report = variant((root) =>
      writeFileSync(
        join(root, 'src', 'lib', 'security', 'ratelimit.ts'),
        `import 'server-only';
export const STORE_TIMEOUT_MS = 1500;
export async function authorizeAiCall() {
  return { allowed: true };
}
`,
      ),
    );
    expect(rules(report)).toContain('FAIL-CLOSED');
  });

  it('catches the counter-store deadline being removed', () => {
    const report = variant((root) => {
      const path = join(root, 'src', 'lib', 'security', 'ratelimit.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(/STORE_TIMEOUT_MS/g, 'SOMETHING_ELSE'));
    });
    expect(rules(report)).toContain('FAIL-CLOSED');
  });

  it('catches production being allowed to use the development secret', () => {
    const report = variant((root) => {
      const path = join(root, 'src', 'lib', 'security', 'env.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(/if \(isProduction\(\)\) throw new MissingSecretError\(\);/, ''));
    });
    expect(rules(report)).toContain('FAIL-CLOSED');
  });

  it('catches fail-closed no longer keying on Redis configuration', () => {
    const report = variant((root) => {
      const path = join(root, 'src', 'lib', 'security', 'env.ts');
      const text = readFileSync(path, 'utf8');
      writeFileSync(path, text.replace(/isProduction\(\) && !redisConfigured\(\)/, 'false'));
    });
    expect(rules(report)).toContain('FAIL-CLOSED');
  });
});

describe('the real repository', () => {
  it('satisfies every invariant', () => {
    // The script is the check; this is the assertion that the project passes it.
    const report = run(process.cwd());
    expect(report.violations, JSON.stringify(report.violations, null, 2)).toEqual([]);
  });
});
