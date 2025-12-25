// ABOUTME: E2E tests for UX revamp features
// ABOUTME: Tests ray-scribble, click-pocket, slice modes, and toolbar restructure

import { test, expect, createTestPointCloud, cleanupTestFiles } from './fixtures'

test.describe('Toolbar Primary/Secondary Split', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should display primary mode buttons in toolbar', async ({ page }) => {
    // Primary modes should be visible directly
    await expect(page.locator('[data-testid="mode-orbit"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-ray_scribble"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-click_pocket"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-slice"]')).toBeVisible()
  })

  test('should display secondary tools dropdown trigger', async ({ page }) => {
    await expect(page.locator('[data-testid="secondary-tools-dropdown"]')).toBeVisible()
  })

  test('should open dropdown and show secondary modes', async ({ app, page }) => {
    await app.openSecondaryToolsDropdown()

    // Secondary modes should be visible in dropdown
    await expect(page.locator('[data-testid="mode-primitive"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-brush"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-seed"]')).toBeVisible()
    await expect(page.locator('[data-testid="mode-import"]')).toBeVisible()
  })

  test('should default to Navigate (orbit) mode', async ({ page }) => {
    const orbitButton = page.locator('[data-testid="mode-orbit"]')
    await expect(orbitButton).toHaveClass(/bg-blue-600/)
  })

  test('should highlight dropdown when secondary mode is active', async ({ app, page }) => {
    // Select a secondary mode
    await app.selectMode('Primitive')

    // Dropdown trigger should be highlighted
    const dropdown = page.locator('[data-testid="secondary-tools-dropdown"]')
    await expect(dropdown).toHaveClass(/bg-blue-600/)
  })
})

test.describe('Ray Scribble Mode', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should switch to Ray Scribble mode via button', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    const rayScribbleButton = page.locator('[data-testid="mode-ray_scribble"]')
    await expect(rayScribbleButton).toHaveClass(/bg-blue-600/)
  })

  test('should switch to Ray Scribble mode via R key', async ({ page }) => {
    await page.keyboard.press('r')

    const rayScribbleButton = page.locator('[data-testid="mode-ray_scribble"]')
    await expect(rayScribbleButton).toHaveClass(/bg-blue-600/)
  })

  test('should show Ray Scribble mode panel when active', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    // Should see ray scribble controls
    await expect(page.getByText(/Empty Band|Scribble|Ray/i).first()).toBeVisible()
  })

  test('should show empty band width slider', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    await expect(page.getByText(/Empty band/i)).toBeVisible()
  })

  test('should show surface band width slider', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    await expect(page.getByText(/Surface band/i)).toBeVisible()
  })

  test('should show spray hand toggle', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    await expect(page.getByText(/Spray hand/i)).toBeVisible()
  })

  test('should have Left and Right handedness options', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    await expect(page.getByRole('radio', { name: /Left/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Right/i })).toBeVisible()
  })

  test('should default to right-handed', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    const rightButton = page.getByRole('radio', { name: /Right/i })
    await expect(rightButton).toHaveClass(/border-purple-500/)
  })

  test('should toggle handedness to left', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    await page.getByRole('radio', { name: /Left/i }).click()

    const leftButton = page.getByRole('radio', { name: /Left/i })
    await expect(leftButton).toHaveClass(/border-purple-500/)
  })
})

test.describe('Click Pocket Mode', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should switch to Click Pocket mode via button', async ({ app, page }) => {
    await app.selectMode('ClickPocket')

    const clickPocketButton = page.locator('[data-testid="mode-click_pocket"]')
    await expect(clickPocketButton).toHaveClass(/bg-blue-600/)
  })

  test('should switch to Click Pocket mode via C key', async ({ page }) => {
    await page.keyboard.press('c')

    const clickPocketButton = page.locator('[data-testid="mode-click_pocket"]')
    await expect(clickPocketButton).toHaveClass(/bg-blue-600/)
  })

  test('should show Click Pocket mode panel when active', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Pocket Panel')
    await app.selectMode('ClickPocket')

    // Should see "Click Pocket" heading in the panel (use locator for h4 element)
    await expect(page.locator('h4').filter({ hasText: 'Click Pocket' })).toBeVisible()
  })

  test('should show Detect Pockets button', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Pocket Button')
    await app.selectMode('ClickPocket')

    await expect(page.getByRole('button', { name: /Detect Pockets/i })).toBeVisible()
  })
})

test.describe('Enhanced Slice Mode', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should switch to Slice mode via button', async ({ app, page }) => {
    await app.selectMode('Slice')

    const sliceButton = page.locator('[data-testid="mode-slice"]')
    await expect(sliceButton).toHaveClass(/bg-blue-600/)
  })

  test('should switch to Slice mode via S key', async ({ page }) => {
    await page.keyboard.press('s')

    const sliceButton = page.locator('[data-testid="mode-slice"]')
    await expect(sliceButton).toHaveClass(/bg-blue-600/)
  })

  test('should show slice plane options', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Slice Options')
    await app.selectMode('Slice')

    // Wait for panel to render and check for XY plane option
    await expect(page.getByText('XY (Top)')).toBeVisible()
  })

  test('should show Slice Plane heading', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Slice Heading')
    await app.selectMode('Slice')

    await expect(page.getByText('Slice Plane')).toBeVisible()
  })

  test('should show Paint Tool section', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Slice Paint')
    await app.selectMode('Slice')

    await expect(page.getByText('Paint Tool')).toBeVisible()
  })

  test('should show paint instructions', async ({ app, page }) => {
    // Panel requires a project to be loaded
    await app.createProject('Test Slice Instructions')
    await app.selectMode('Slice')

    // Instructions panel shows "Paint on the 2D slice"
    await expect(page.getByText(/Paint.*2D slice/i)).toBeVisible()
  })
})

test.describe('Keyboard Shortcuts for New Modes', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('R key should activate Ray Scribble mode', async ({ page }) => {
    await page.keyboard.press('r')
    await expect(page.locator('[data-testid="mode-ray_scribble"]')).toHaveClass(/bg-blue-600/)
  })

  test('C key should activate Click Pocket mode', async ({ page }) => {
    await page.keyboard.press('c')
    await expect(page.locator('[data-testid="mode-click_pocket"]')).toHaveClass(/bg-blue-600/)
  })

  test('Y key should activate Cylinder in Primitive mode', async ({ app, page }) => {
    // First switch to Primitive mode
    await app.selectMode('Primitive')

    // Then press Y for cylinder
    await page.keyboard.press('y')

    // Should still be in primitive mode (cylinder is a sub-option)
    const dropdown = page.locator('[data-testid="secondary-tools-dropdown"]')
    await expect(dropdown).toHaveClass(/bg-blue-600/)
  })

  test('Escape should return to Navigate mode from Ray Scribble', async ({ page }) => {
    await page.keyboard.press('r')
    await expect(page.locator('[data-testid="mode-ray_scribble"]')).toHaveClass(/bg-blue-600/)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="mode-orbit"]')).toHaveClass(/bg-blue-600/)
  })

  test('Escape should return to Navigate mode from Click Pocket', async ({ page }) => {
    await page.keyboard.press('c')
    await expect(page.locator('[data-testid="mode-click_pocket"]')).toHaveClass(/bg-blue-600/)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="mode-orbit"]')).toHaveClass(/bg-blue-600/)
  })

  test('Secondary mode shortcuts should still work', async ({ page }) => {
    // P for Primitive
    await page.keyboard.press('p')
    await expect(page.locator('[data-testid="secondary-tools-dropdown"]')).toHaveClass(/bg-blue-600/)

    // Escape back
    await page.keyboard.press('Escape')

    // B for Brush
    await page.keyboard.press('b')
    await expect(page.locator('[data-testid="secondary-tools-dropdown"]')).toHaveClass(/bg-blue-600/)
  })
})

test.describe('Mode-specific UI Content', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('Ray Scribble mode shows instructions', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    // Should have instructions about scribbling
    await expect(page.getByText(/drag|scribble|draw/i).first()).toBeVisible()
  })

  test('Click Pocket mode shows instructions', async ({ app, page }) => {
    await app.selectMode('ClickPocket')

    // Should have instructions about clicking pockets
    await expect(page.getByText(/click|select|toggle/i).first()).toBeVisible()
  })

  test('Slice mode shows current label indicator', async ({ app, page }) => {
    await app.selectMode('Slice')

    // Should show which label is being painted
    await expect(page.getByText(/Label:|Solid|Empty|Surface/i).first()).toBeVisible()
  })
})

test.describe('Integration with Project', () => {
  let testFilePath: string

  test.beforeAll(() => {
    testFilePath = createTestPointCloud(500)
  })

  test.afterAll(() => {
    cleanupTestFiles()
  })

  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should create project and switch modes', async ({ app, page }) => {
    // Create a test project
    await app.createProject('E2E Mode Test')

    // Switch through primary modes
    await app.selectMode('RayScribble')
    await expect(page.locator('[data-testid="mode-ray_scribble"]')).toHaveClass(/bg-blue-600/)

    await app.selectMode('ClickPocket')
    await expect(page.locator('[data-testid="mode-click_pocket"]')).toHaveClass(/bg-blue-600/)

    await app.selectMode('Slice')
    await expect(page.locator('[data-testid="mode-slice"]')).toHaveClass(/bg-blue-600/)

    // Switch through secondary modes
    await app.selectMode('Primitive')
    await expect(page.locator('[data-testid="secondary-tools-dropdown"]')).toHaveClass(/bg-blue-600/)

    await app.selectMode('Brush')
    await expect(page.locator('[data-testid="secondary-tools-dropdown"]')).toHaveClass(/bg-blue-600/)
  })

  test('should upload point cloud and use new modes', async ({ app, page }) => {
    // Create and select project
    await app.createProject('E2E Upload Mode Test')

    // Upload file
    await app.uploadFile(testFilePath)

    // Wait for upload to process
    await page.waitForTimeout(2000)

    // Should be able to switch to Ray Scribble mode
    await app.selectMode('RayScribble')
    await expect(page.locator('[data-testid="mode-ray_scribble"]')).toHaveClass(/bg-blue-600/)

    // Canvas should still be visible
    await expect(app.canvas).toBeVisible()
  })
})

test.describe('Label Selection in New Modes', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto()
  })

  test('should allow label selection in Ray Scribble mode', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    // Select Empty label
    const emptyButton = page.getByRole('radio', { name: 'Empty' })
    await emptyButton.click()
    await expect(emptyButton).toHaveClass(/ring-2/)
  })

  test('should allow label selection in Click Pocket mode', async ({ app, page }) => {
    await app.selectMode('ClickPocket')

    // Select Solid label
    const solidButton = page.getByRole('radio', { name: 'Solid' })
    await solidButton.click()
    await expect(solidButton).toHaveClass(/ring-2/)
  })

  test('should allow label selection in Slice mode', async ({ app, page }) => {
    await app.selectMode('Slice')

    // Select Surface label
    const surfaceButton = page.getByRole('radio', { name: 'Surface' })
    await surfaceButton.click()
    await expect(surfaceButton).toHaveClass(/ring-2/)
  })

  test('Tab key should cycle labels in all modes', async ({ app, page }) => {
    await app.selectMode('RayScribble')

    // Start with Solid (default)
    await expect(page.getByRole('radio', { name: 'Solid' })).toHaveClass(/ring-2/)

    // Tab to Empty
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio', { name: 'Empty' })).toHaveClass(/ring-2/)

    // Tab to Surface
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio', { name: 'Surface' })).toHaveClass(/ring-2/)

    // Tab back to Solid
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio', { name: 'Solid' })).toHaveClass(/ring-2/)
  })
})
