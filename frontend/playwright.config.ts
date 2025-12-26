// ABOUTME: Playwright E2E test configuration
// ABOUTME: Configures browser, server startup, and test settings

import { defineConfig, devices } from '@playwright/test'

const E2E_DATA_DIR = '/tmp/sdf-labeler-e2e-data'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // Global setup and teardown for test isolation
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  forbidOnly: !!process.env.CI,
  // Retries help with flaky upload tests that can fail under parallel load
  retries: process.env.CI ? 2 : 1,
  // Limit workers to avoid overwhelming the backend with concurrent uploads
  workers: process.env.CI ? 1 : 8,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start frontend dev server
  webServer: [
    {
      command: 'cd ../backend && uv run uvicorn sdf_labeler_api.app:app --host 0.0.0.0 --port 8001',
      url: 'http://localhost:8001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      // Use isolated data directory for E2E tests
      env: {
        SDF_LABELER_DATA_DIR: E2E_DATA_DIR,
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],

  // Test timeout
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
})
