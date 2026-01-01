import { test, expect, setupPuppet, describe } from 'puppet/test';

setupPuppet();

describe('Google.com', () => {
  test('can navigate and read content', async ({ page }) => {
    await page.goto('https://www.google.com');

    // Check page loaded
    await expect(page).toHaveTitle('Google');
    await expect(page).toHaveURL('google.com');

    // Check search input exists
    await expect(page).toBeVisible('textarea[name="q"]');
  });

  test('can take screenshot', async ({ page }) => {
    await page.goto('https://www.google.com');

    const screenshot = await page.screenshot();

    // Screenshot returns base64 data
    expect(screenshot).toBeTruthy();
    expect(screenshot.length).toBeGreaterThan(1000); // Should be a substantial image
  });

  test('can get page info', async ({ page }) => {
    await page.goto('https://www.google.com');

    const url = await page.url();
    const title = await page.title();

    expect(url).toContain('google.com');
    expect(title).toBe('Google');
  });

  test('can type in search box', async ({ page }) => {
    await page.goto('https://www.google.com');

    // Type in search box using CSS selector
    await page.type('textarea[name="q"]', 'playwright testing');

    // Verify value was typed
    await expect(page).toHaveValue('textarea[name="q"]', 'playwright testing');
  });
});
