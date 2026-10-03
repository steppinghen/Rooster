import { defineConfig, devices } from '@playwright/test';
import { AGENT, ANON_KEY, ORIGIN, SUPABASE_URL, AGENT_ENV, onTailscaleOrigin } from './e2e/helpers/agent';

// WebKit only: the family uses iPhone and iPad. Kid screens are tested at iPad portrait,
// parent screens at iPhone and iPad landscape (the kitchen hub layout).
//
// Each agent runs against its own local stack and its own app server (DECK_AGENT, default
// `build`; see scripts/agent-stack.mjs), always on the Tailscale origin over plain http.
if (!onTailscaleOrigin()) throw new Error(`Tests run on the Tailscale origin, not ${ORIGIN}`);

const port = AGENT_ENV.DECK_VITE_PORT;
export default defineConfig({
  testDir: './e2e',
  // DECK_E2E_PART=phase1 | phase15 runs one half of the suite (the slice15-* specs are 1.5's).
  testIgnore: process.env.DECK_E2E_PART === 'phase1' ? /slice15-/ : undefined,
  testMatch: process.env.DECK_E2E_PART === 'phase15' ? /slice15-.*\.spec\.ts$/ : undefined,
  globalSetup: './e2e/global-setup.ts',
  // Each run wipes its output folder at start: a one-off run beside a long one on the same
  // agent sets DECK_E2E_OUT (e.g. test-results/build-adhoc) so it doesn't break the long one.
  outputDir: process.env.DECK_E2E_OUT ?? `./test-results/${AGENT}`,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Nothing may wait forever (a run once hung for over an hour). A test gets 60 s unless it
  // asks for more with test.setTimeout; a single click or wait gets 15 s, a page load 20 s, so a
  // stuck step fails fast and names itself; and the whole run stops at 40 minutes
  // (DECK_E2E_RUN_MIN to change it). Long suites run in halves: npm run test:e2e:phase1 / :phase15.
  timeout: 60_000,
  globalTimeout: Number(process.env.DECK_E2E_RUN_MIN ?? 40) * 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: ORIGIN,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], viewport: { width: 1180, height: 820 } } },
    { name: 'iphone', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // dev: the parent's netlify dev on 8894. Agents: their own Vite on their own port, pointed
    // at their own stack (env vars beat .env.local in Vite).
    command: AGENT === 'dev' ? 'npm run dev' : `npx vite --host 0.0.0.0 --port ${port} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 60_000,
    env: AGENT === 'dev' ? {} : { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY, DECK_VITE_CACHE: `node_modules/.vite-${AGENT}` },
  },
});
