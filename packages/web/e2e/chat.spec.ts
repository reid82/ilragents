import { test, expect } from '@playwright/test';

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set onboarded state to bypass gate
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'ilre-session',
        JSON.stringify({
          state: { isOnboarded: true, sessionId: 'test-session' },
          version: 0,
        })
      );
    });
  });

  test('chat page loads for baseline-ben with correct agent name', async ({ page }) => {
    await page.goto('/chat/baseline-ben');
    await expect(page.getByRole('heading', { name: 'Baseline Ben' })).toBeVisible();
  });

  test('format selector is visible', async ({ page }) => {
    await page.goto('/chat/baseline-ben');
    const select = page.locator('select');
    await expect(select).toBeVisible();
    // Check that format options exist
    await expect(page.locator('option[value="concise"]')).toBeAttached();
    await expect(page.locator('option[value="standard"]')).toBeAttached();
    await expect(page.locator('option[value="detailed"]')).toBeAttached();
  });

  test('chat input is present and enabled', async ({ page }) => {
    await page.goto('/chat/baseline-ben');
    const input = page.locator('input[type="text"]');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('voice button is visible', async ({ page }) => {
    await page.goto('/chat/baseline-ben');
    await expect(page.locator('button:has-text("Voice")')).toBeVisible();
  });

  test('back link navigates to home', async ({ page }) => {
    await page.goto('/chat/baseline-ben');
    await page.click('text=Back');
    await expect(page).toHaveURL('/');
  });
});
