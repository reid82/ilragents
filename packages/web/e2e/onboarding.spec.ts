import { test, expect } from '@playwright/test';

test.describe('Onboarding Page', () => {
  test('onboarding page loads', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.locator('text=Welcome to ILRE Agents')).toBeVisible();
  });

  test('input field is present', async ({ page }) => {
    await page.goto('/onboarding');
    const input = page.locator('input[type="text"]');
    await expect(input).toBeVisible();
  });

  test('header shows welcome text', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(
      page.locator('text=Let Baseline Ben learn about your financial position')
    ).toBeVisible();
  });
});
