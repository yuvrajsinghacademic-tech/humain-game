import { webcrypto } from 'node:crypto';
import '@testing-library/jest-dom/vitest';

/**
 * Test environment shims.
 *
 * jsdom does not ship a WebCrypto implementation with `subtle`, and the
 * commitment code is deliberately isomorphic — it uses `crypto.subtle` so the
 * same hashing runs in the browser and on the server. Node's WebCrypto is
 * installed here so the tests exercise the real code path rather than a mock.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

/** A fixed sealing secret so envelope tests are deterministic. */
process.env.GAME_SEAL_SECRET = 'test-seal-secret-0123456789abcdefghijklmnop';
process.env.MOCK_AI = 'true';
delete process.env.OPENAI_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
