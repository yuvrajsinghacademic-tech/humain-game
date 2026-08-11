import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite runs against a real production build, started with the deterministic
 * stand-in model and a fixed sealing secret so no keys are needed and the run is
 * reproducible. `NEXT_PUBLIC_ALLOW_SEED` is inlined at build time, which is why it
 * has to be set for the build command and not just the server.
 */

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      /*
       * Live audio verification. Chromium is launched with autoplay permitted so real
       * playback actually starts and the assertions can read the media elements. The
       * application still waits for ENTER — the flag removes the browser's gate, not
       * the game's.
       */
      name: 'audio',
      testMatch: /audio-live\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(mobile|audio-live)\.spec\.ts/,
      // Screenshot capture belongs to whichever project is being reviewed; the
      // desktop project keeps it so `CAPTURE=true` covers both widths.
    },
    {
      name: 'mobile',
      // A phone-sized Chromium rather than the iPhone preset, which would pull in
      // WebKit. The layout assertions are about viewport width, touch targets and
      // horizontal overflow, none of which need a second engine — and this keeps
      // `npm run test:e2e` working after installing chromium alone.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      // The capture spec is included here too so the art direction can be
      // reviewed at phone width; it is a no-op unless CAPTURE=true.
      testMatch: /(mobile|screenshots)\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      MOCK_AI: 'true',
      GAME_SEAL_SECRET: 'e2e-seal-secret-0123456789abcdefghijklmnopqrstuv',
      NEXT_PUBLIC_ALLOW_SEED: 'true',
    },
  },
});
