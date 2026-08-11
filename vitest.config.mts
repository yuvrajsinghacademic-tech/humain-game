import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the `@/*` alias straight from tsconfig.json — no extra plugin.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws by design outside a React Server Component graph.
      // Unit tests legitimately import the server modules directly, so the marker
      // is stubbed out here. Its real job — failing the build if a client
      // component imports a server module — still happens during `next build`.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    /*
     * Process and inject CSS modules so `getComputedStyle` returns real values. The
     * consent document's containment — a viewport-bounded overlay, one internal
     * scrolling region, an opaque pinned action row — is a CSS contract, and without
     * this those assertions would silently pass against empty styles.
     */
    css: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});
