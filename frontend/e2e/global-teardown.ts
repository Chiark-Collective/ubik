// ABOUTME: Playwright global teardown for E2E test cleanup
// ABOUTME: Removes the temp data directory after test completion

import * as fs from 'fs'

const E2E_DATA_DIR = '/tmp/sdf-labeler-e2e-data'

async function globalTeardown() {
  if (fs.existsSync(E2E_DATA_DIR)) {
    fs.rmSync(E2E_DATA_DIR, { recursive: true })
    console.log(`[E2E Teardown] Cleaned up test data directory: ${E2E_DATA_DIR}`)
  }
}

export default globalTeardown
