/**
 * Example test using puppet/test
 *
 * Note: Network tests may fail if there's a proxy/VPN intercepting traffic.
 * These tests verify the API works with data: URLs which don't require network.
 */

import { test, expect, setupPuppet, describe } from '../dist/test/index.js';

// Setup cleanup on test completion
setupPuppet();

describe('Puppet Test Runner', () => {
  test('provides page fixture with browser methods', async ({ page }) => {
    // Verify the page fixture has expected methods
    expect(typeof page.goto).toBe('function');
    expect(typeof page.click).toBe('function');
    expect(typeof page.type).toBe('function');
    expect(typeof page.text).toBe('function');
    expect(typeof page.url).toBe('function');
    expect(typeof page.title).toBe('function');
    expect(typeof page.screenshot).toBe('function');
    expect(typeof page.close).toBe('function');
  });

  test('can navigate to data: URL', async ({ page }) => {
    // Use a data: URL which doesn't require network
    await page.goto(
      'data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>'
    );

    // Check title
    const title = await page.title();
    expect(title).toBe('Test Page');
  });

  test('can get text content', async ({ page }) => {
    await page.goto(
      'data:text/html,<html><body><div id="content">Test Content</div></body></html>'
    );

    // Get text using CSS selector
    const text = await page.text('#content');
    expect(text).toBe('Test Content');
  });

  test('can evaluate JavaScript', async ({ page }) => {
    await page.goto('data:text/html,<html><body></body></html>');

    // Evaluate JS in page context
    const result = await page.evaluate('1 + 2');
    expect(result).toBe(3);
  });

  test('custom matchers work', async ({ page }) => {
    await page.goto(
      'data:text/html,<html><head><title>Custom Matcher Test</title></head><body><h1>Visible</h1></body></html>'
    );

    // Test custom matchers
    await expect(page).toHaveTitle('Custom Matcher Test');
    await expect(page).toBeVisible('h1');
    await expect(page).toHaveText('h1', 'Visible');
  });
});
