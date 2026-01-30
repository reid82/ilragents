import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('home page loads with ILRE Agents heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('ILRE Agents');
  });

  test('home page shows Baseline Ben hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Baseline Ben')).toBeVisible();
    await expect(page.locator('text=Start Here')).toBeVisible();
  });

  test('clicking Baseline Ben navigates to onboarding when not onboarded', async ({ page }) => {
    await page.goto('/');
    // Clear localStorage to ensure not onboarded
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Click the Baseline Ben hero link
    await page.click('text=Begin your assessment');
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('strategy agents show Locked when not onboarded', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for hydration
    await page.waitForTimeout(500);
    const lockedBadges = page.locator('text=Locked');
    await expect(lockedBadges.first()).toBeVisible();
  });

  test('invalid agent slug shows Agent not found', async ({ page }) => {
    await page.goto('/chat/nonexistent-agent-xyz');
    await expect(page.locator('text=Agent not found')).toBeVisible();
  });
});
