import { defineConfig, devices } from '@playwright/test';

// WebKit only: the family uses iPhone and iPad. Kid screens are tested at iPad portrait,
// parent screens at iPhone and iPad landscape (the kitchen hub layout).
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3997',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], viewport: { width: 1180, height: 820 } } },
    { name: 'iphone', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run dev:vite',
    url: 'http://127.0.0.1:3997',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
