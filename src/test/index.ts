/**
 * Puppet Test Runner
 *
 * First-class integration with Vitest for browser testing.
 *
 * @example
 * ```typescript
 * import { test, expect, setupPuppet } from 'puppet/test';
 *
 * setupPuppet();
 *
 * test('user can login', async ({ page }) => {
 *   await page.goto('/login');
 *   await page.type('email', 'user@example.com');
 *   await page.type('password', 'secret123');
 *   await page.click('submit');
 *
 *   await expect(page).toHaveURL('/dashboard');
 *   await expect(page).toHaveText('welcome', 'Hello, User');
 * });
 * ```
 */

// Test runner
export {
  test,
  expect,
  describe,
  it,
  setupPuppet,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from './runner.js';

// Configuration
export { defineConfig, getConfig, resetConfig, resolveURL } from './config.js';
export type { PuppetTestConfig } from './config.js';

// Matchers (for advanced usage)
export { puppetMatchers } from './matchers.js';
