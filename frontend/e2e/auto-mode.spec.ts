// ABOUTME: E2E tests for Auto Analysis mode
// ABOUTME: Tests constraint generation workflow and review/apply UI

import { test, expect, createTestPointCloud, cleanupTestFiles } from './fixtures'

test.describe('Auto Mode UI', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should display auto mode button in toolbar', async ({ page }) => {
    await expect(page.locator('[data-testid="mode-auto"]')).toBeVisible()
  })

  test('should switch to Auto mode via button click', async ({ app, page }) => {
    await app.selectMode('Auto')

    await expect(page.locator('[data-testid="mode-auto"]')).toHaveClass(/bg-blue-600/)
    await expect(app.getModeButton('Orbit')).not.toHaveClass(/bg-blue-600/)
  })

  test('should switch to Auto mode with A key', async ({ page }) => {
    await page.keyboard.press('a')

    await expect(page.locator('[data-testid="mode-auto"]')).toHaveClass(/bg-blue-600/)
  })

  test('should return to Orbit from Auto mode with Escape', async ({ app, page }) => {
    await app.selectMode('Auto')
    await expect(page.locator('[data-testid="mode-auto"]')).toHaveClass(/bg-blue-600/)

    await page.keyboard.press('Escape')
    await expect(app.getModeButton('Orbit')).toHaveClass(/bg-blue-600/)
  })

  test('should show Auto Analysis panel when in Auto mode', async ({ app, page }) => {
    // Auto mode panel requires a project to be loaded
    await app.createProject('Auto Panel Test')
    await app.selectMode('Auto')

    // Should see auto analysis heading
    await expect(page.locator('h4').filter({ hasText: 'Auto Analysis' })).toBeVisible()
  })

  test('should show Run Analysis button when project loaded', async ({ app, page }) => {
    // Auto mode panel requires a project to be loaded
    await app.createProject('Auto Button Test')
    await app.selectMode('Auto')

    // Button should show "Run Analysis" (not "Re-analyze")
    const analyzeButton = page.locator('button:has-text("Run Analysis")')
    await expect(analyzeButton).toBeVisible()
  })

  test('should show algorithm description when no analysis exists', async ({ app, page }) => {
    // Auto mode panel requires a project to be loaded
    await app.createProject('Auto Description Test')
    await app.selectMode('Auto')

    // Should see algorithm descriptions
    await expect(page.getByText(/Pockets.*Interior cavities/i)).toBeVisible()
    await expect(page.getByText(/Convex Hull.*Exterior boundaries/i)).toBeVisible()
  })
})

test.describe('Auto Mode with Project', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should run analysis when button clicked with uploaded pointcloud', async ({ app, page }) => {
    // Create test file for this test
    const testFilePath = createTestPointCloud(500)

    try {
      // Create project
      await app.createProject('Auto Analysis Test')

      // Upload pointcloud
      await app.uploadFile(testFilePath)

      // Wait for upload to complete
      await page.waitForTimeout(1000)

      // Switch to auto mode
      await app.selectMode('Auto')

      // Click Run Analysis
      const analyzeButton = page.locator('button:has-text("Run Analysis")')
      await expect(analyzeButton).toBeVisible()
      await analyzeButton.click()

      // Wait for analysis to complete (button should change to "Re-analyze")
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })

      // Should show constraint summary
      await expect(page.getByText(/constraints generated/i)).toBeVisible()
    } finally {
      cleanupTestFiles()
    }
  })

  test('should show generated constraints after analysis', async ({ app, page }) => {
    // Create test file for this test
    const testFilePath = createTestPointCloud(500)

    try {
      // Create project and upload
      await app.createProject('Auto Constraints Test')
      await app.uploadFile(testFilePath)
      await page.waitForTimeout(1000)

      // Run analysis
      await app.selectMode('Auto')
      await page.locator('button:has-text("Run Analysis")').click()
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })

      // Should show solid/empty counts
      await expect(page.getByText(/solid/i)).toBeVisible()
      await expect(page.getByText(/empty/i)).toBeVisible()

      // Should show Select All / Deselect All buttons
      await expect(page.getByText('Select All')).toBeVisible()
      await expect(page.getByText('Deselect All')).toBeVisible()
    } finally {
      cleanupTestFiles()
    }
  })

  test('should be able to select and deselect constraints', async ({ app, page }) => {
    // Create test file for this test
    const testFilePath = createTestPointCloud(500)

    try {
      // Create project and upload
      await app.createProject('Auto Select Test')
      await app.uploadFile(testFilePath)
      await page.waitForTimeout(1000)

      // Run analysis
      await app.selectMode('Auto')
      await page.locator('button:has-text("Run Analysis")').click()
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })

      // Deselect all
      await page.getByText('Deselect All').click()

      // Apply button should be disabled (0 selected)
      const applyButton = page.locator('button:has-text("Apply")')
      await expect(applyButton).toContainText('Apply 0 of')

      // Select all again
      await page.getByText('Select All').click()

      // Apply button should show selected count
      await expect(applyButton).not.toContainText('Apply 0 of')
    } finally {
      cleanupTestFiles()
    }
  })

  test('should apply selected constraints', async ({ app, page }) => {
    // Create test file for this test
    const testFilePath = createTestPointCloud(500)

    try {
      // Create project and upload
      await app.createProject('Auto Apply Test')
      await app.uploadFile(testFilePath)
      await page.waitForTimeout(1000)

      // Run analysis
      await app.selectMode('Auto')
      await page.locator('button:has-text("Run Analysis")').click()
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })

      // Apply constraints
      const applyButton = page.locator('button:has-text("Apply")')
      await applyButton.click()

      // Should show success toast
      await expect(page.getByText(/Constraints applied/i)).toBeVisible({ timeout: 5000 })
    } finally {
      cleanupTestFiles()
    }
  })

  test('should rerun analysis when Re-analyze clicked', async ({ app, page }) => {
    // Create test file for this test
    const testFilePath = createTestPointCloud(500)

    try {
      // Create project and upload
      await app.createProject('Auto Rerun Test')
      await app.uploadFile(testFilePath)
      await page.waitForTimeout(1000)

      // Run initial analysis
      await app.selectMode('Auto')
      await page.locator('button:has-text("Run Analysis")').click()
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })

      // Click Re-analyze
      await page.locator('button:has-text("Re-analyze")').click()

      // Should show loading state briefly then complete
      await expect(page.locator('button:has-text("Re-analyze")')).toBeVisible({ timeout: 30000 })
    } finally {
      cleanupTestFiles()
    }
  })
})

test.describe('Auto Mode Mode Switching', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should preserve auto mode UI when switching back', async ({ app, page }) => {
    // Create project (required for auto mode panel)
    await app.createProject('Auto Mode Switch Test')

    // Switch to auto mode
    await app.selectMode('Auto')
    await expect(page.locator('h4').filter({ hasText: 'Auto Analysis' })).toBeVisible()

    // Switch to another mode (Orbit doesn't require project)
    await app.selectMode('Orbit')
    await expect(app.getModeButton('Orbit')).toHaveClass(/bg-blue-600/)

    // Switch back to auto
    await app.selectMode('Auto')
    await expect(page.locator('h4').filter({ hasText: 'Auto Analysis' })).toBeVisible()
  })
})
