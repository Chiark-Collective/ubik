// ABOUTME: E2E tests for scenario loading and switching
// ABOUTME: Verifies that switching datasets updates the UI without refresh

import { test, expect } from './fixtures'

test.describe('Scenario Loading', () => {
  test('should load a scenario and display point cloud', async ({ app, page }) => {
    await app.goto()

    // Create a project
    const projectName = `Scenario Test ${Date.now()}`
    await app.createProject(projectName)
    await app.dismissToast()

    // Make sure we're on the Demo Data tab (should be default)
    const demoDataTab = page.locator('button:has-text("Demo Data")')
    if (await demoDataTab.isVisible()) {
      await demoDataTab.click()
    }

    // Wait for category buttons to appear (Trenchfoot/SDF Shapes)
    // Use exact match to avoid matching scenario names containing "Trenchfoot"
    const trenchfootCategoryBtn = page.getByRole('button', { name: 'Trenchfoot', exact: true })
    await expect(trenchfootCategoryBtn).toBeVisible({ timeout: 10000 })

    // Click Trenchfoot to ensure we're on that category
    await trenchfootCategoryBtn.click()

    // Wait for scenario list to load - look for the scenario list container
    // The scenarios are in a ul with specific classes inside the Demo Data section
    const scenarioList = page.locator('ul.space-y-1.max-h-48')
    await expect(scenarioList).toBeVisible({ timeout: 10000 })

    // Click on a scenario button
    const scenarioButton = scenarioList.locator('button').first()
    await expect(scenarioButton).toBeVisible({ timeout: 5000 })
    await scenarioButton.click()

    // Wait for scenario to load
    await expect(app.getToastTitle('Scenario loaded')).toBeVisible({ timeout: 60000 })
    await app.dismissToast()

    // Verify point cloud is loaded (status bar shows points - may have K/M suffix)
    await expect(app.statusBar).toContainText(/\d+(\.\d+)?[KMB]?.*points/, { timeout: 15000 })
  })

  test('should switch scenarios without page refresh', async ({ app, page }) => {
    await app.goto()

    // Create a project
    const projectName = `Switch Scenario Test ${Date.now()}`
    await app.createProject(projectName)
    await app.dismissToast()

    // Make sure we're on the Demo Data tab
    const demoDataTab = page.locator('button:has-text("Demo Data")')
    if (await demoDataTab.isVisible()) {
      await demoDataTab.click()
    }

    // Wait for category buttons and click Trenchfoot (exact match)
    const trenchfootCategoryBtn = page.getByRole('button', { name: 'Trenchfoot', exact: true })
    await expect(trenchfootCategoryBtn).toBeVisible({ timeout: 10000 })
    await trenchfootCategoryBtn.click()

    // Wait for scenario list
    const scenarioList = page.locator('ul.space-y-1.max-h-48')
    await expect(scenarioList).toBeVisible({ timeout: 10000 })

    // Get all scenario buttons
    const scenarioButtons = scenarioList.locator('button')
    const buttonCount = await scenarioButtons.count()

    if (buttonCount < 2) {
      test.skip(true, 'Need at least 2 scenarios to test switching')
      return
    }

    // Load first scenario
    await scenarioButtons.first().click()
    await expect(app.getToastTitle('Scenario loaded')).toBeVisible({ timeout: 60000 })
    await app.dismissToast()

    // Wait for point cloud to load
    await expect(app.statusBar).toContainText(/\d+(\.\d+)?[KMB]?.*points/, { timeout: 15000 })

    // Load second scenario (different dataset)
    await scenarioButtons.nth(1).click()
    await expect(app.getToastTitle('Scenario loaded')).toBeVisible({ timeout: 60000 })
    await app.dismissToast()

    // Verify canvas is still visible (no crash)
    await expect(app.canvas).toBeVisible()

    // Verify status bar still shows points
    await expect(app.statusBar).toContainText(/\d+(\.\d+)?[KMB]?.*points/, { timeout: 15000 })
  })
})

test.describe('Constraint Persistence', () => {
  test('should persist constraints across page refresh', async ({ app, page }) => {
    await app.goto()

    // Create a project and load a scenario
    const projectName = `Persistence Test ${Date.now()}`
    await app.createProject(projectName)
    await app.dismissToast()

    // Load a scenario
    const demoDataTab = page.locator('button:has-text("Demo Data")')
    if (await demoDataTab.isVisible()) {
      await demoDataTab.click()
    }

    // Wait for category buttons and click Trenchfoot (exact match)
    const trenchfootCategoryBtn = page.getByRole('button', { name: 'Trenchfoot', exact: true })
    await expect(trenchfootCategoryBtn).toBeVisible({ timeout: 10000 })
    await trenchfootCategoryBtn.click()

    // Wait for scenario list and click first scenario
    const scenarioList = page.locator('ul.space-y-1.max-h-48')
    await expect(scenarioList).toBeVisible({ timeout: 10000 })
    await scenarioList.locator('button').first().click()
    await expect(app.getToastTitle('Scenario loaded')).toBeVisible({ timeout: 60000 })
    await app.dismissToast()

    // Wait for point cloud to load
    await expect(app.statusBar).toContainText(/\d+(\.\d+)?[KMB]?.*points/, { timeout: 15000 })

    // Switch to ray scribble mode
    await app.selectMode('RayScribble')

    // Draw on the canvas to create a constraint
    const canvasBox = await app.canvas.boundingBox()
    if (!canvasBox) {
      throw new Error('Canvas not found')
    }

    // Perform a spray paint stroke (click and drag)
    const centerX = canvasBox.x + canvasBox.width / 2
    const centerY = canvasBox.y + canvasBox.height / 2

    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 50, centerY, { steps: 5 })
    await page.mouse.up()

    // Wait for constraint to be created
    await page.waitForTimeout(2000)

    // Check that constraints panel shows at least 1 constraint
    const constraintsHeader = page.locator('h3:has-text("Constraints")')
    await expect(constraintsHeader).toContainText(/Constraints \([1-9]/, { timeout: 10000 })

    // Refresh the page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Select the same project again
    await app.selectProject(projectName)
    await page.waitForTimeout(2000)

    // Verify constraint is still there (persisted to backend and reloaded)
    await expect(page.locator('h3:has-text("Constraints")')).toContainText(/Constraints \([1-9]/, { timeout: 15000 })
  })

  test('should create ray carve constraint with spray paint tool', async ({ app, page }) => {
    await app.goto()

    // Create project and load scenario
    const projectName = `Ray Carve Test ${Date.now()}`
    await app.createProject(projectName)
    await app.dismissToast()

    const demoDataTab = page.locator('button:has-text("Demo Data")')
    if (await demoDataTab.isVisible()) {
      await demoDataTab.click()
    }

    // Wait for category buttons and click Trenchfoot (exact match)
    const trenchfootCategoryBtn = page.getByRole('button', { name: 'Trenchfoot', exact: true })
    await expect(trenchfootCategoryBtn).toBeVisible({ timeout: 10000 })
    await trenchfootCategoryBtn.click()

    // Wait for scenario list and click first scenario
    const scenarioList = page.locator('ul.space-y-1.max-h-48')
    await expect(scenarioList).toBeVisible({ timeout: 10000 })
    await scenarioList.locator('button').first().click()
    await expect(app.getToastTitle('Scenario loaded')).toBeVisible({ timeout: 60000 })
    await app.dismissToast()

    // Wait for point cloud
    await expect(app.statusBar).toContainText(/\d+(\.\d+)?[KMB]?.*points/, { timeout: 15000 })

    // Switch to ray scribble mode
    await app.selectMode('RayScribble')

    // Verify mode is active
    await expect(app.getModeButton('RayScribble')).toHaveClass(/bg-blue-600/)

    // Get canvas dimensions
    const canvasBox = await app.canvas.boundingBox()
    if (!canvasBox) {
      throw new Error('Canvas not found')
    }

    // Spray paint on the point cloud
    const centerX = canvasBox.x + canvasBox.width / 2
    const centerY = canvasBox.y + canvasBox.height / 2

    // Perform spray paint stroke
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    // Drag across the canvas
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(centerX + i * 10, centerY + i * 5, { steps: 2 })
      await page.waitForTimeout(50)
    }
    await page.mouse.up()

    // Wait for constraint creation
    await page.waitForTimeout(2000)

    // Verify constraint was created - should show "ray_carve" in constraints list
    const constraintsList = page.locator('text=ray_carve')
    await expect(constraintsList.first()).toBeVisible({ timeout: 10000 })
  })
})
