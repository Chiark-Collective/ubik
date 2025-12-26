// ABOUTME: Playwright global setup for E2E test isolation
// ABOUTME: Creates a dedicated temp directory for backend data during test runs

import * as fs from 'fs'

const E2E_DATA_DIR = '/tmp/sdf-labeler-e2e-data'

async function globalSetup() {
  // Clean up any leftover data from previous runs
  if (fs.existsSync(E2E_DATA_DIR)) {
    fs.rmSync(E2E_DATA_DIR, { recursive: true })
  }

  // Create fresh directory
  fs.mkdirSync(E2E_DATA_DIR, { recursive: true })

  console.log(`[E2E Setup] Created test data directory: ${E2E_DATA_DIR}`)
}

export default globalSetup
