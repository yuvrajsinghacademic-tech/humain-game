/**
 * Stand-in for the `server-only` marker package during unit tests.
 *
 * The real package throws on import outside a server graph, which is exactly what
 * makes it useful in the build. Vitest imports these modules directly, so the
 * marker is aliased here (see `vitest.config.ts`).
 */
export {};
