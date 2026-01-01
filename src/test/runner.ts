/**
 * Test runner wrapper for Vitest
 *
 * Provides a `page` fixture that automatically manages browser lifecycle.
 */

import * as fs from 'fs';
import * as path from 'path';

import { test as baseTest, expect as baseExpect, afterAll, describe as baseDescribe } from 'vitest';

import { puppet, Browser } from '../fluent.js';

import { getConfig } from './config.js';
import { puppetMatchers } from './matchers.js';

// Extend expect with custom matchers
baseExpect.extend(puppetMatchers);

/**
 * Test fixtures
 */
interface PuppetFixtures {
  /** Browser instance with fluent API */
  page: Browser;
}

// Shared browser instance for all tests in a file
let sharedBrowser: Browser | null = null;

/**
 * Create the test function with page fixture
 */
export const test = baseTest.extend<PuppetFixtures>({
  page: async ({ task }, use) => {
    const config = getConfig();

    // Reuse browser instance if available
    if (!sharedBrowser || !sharedBrowser.isRunning()) {
      sharedBrowser = await puppet({
        headless: config.headless,
      });
    }

    const browser = sharedBrowser;

    try {
      // Run the test
      await use(browser);
    } catch (error) {
      // Screenshot on failure
      if (config.screenshotOnFailure) {
        try {
          const screenshotDir = config.screenshotDir;
          if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
          }

          const testName = (task?.name ?? 'unknown').replace(/[^a-zA-Z0-9]/g, '-');
          const screenshotPath = path.join(screenshotDir, `${testName}-failure.png`);
          await browser.screenshot(screenshotPath);
          console.log(`Screenshot saved: ${screenshotPath}`);
        } catch (ssError) {
          console.error('Failed to take screenshot:', ssError);
        }
      }
      throw error;
    }
  },
});

/**
 * Setup function to run before all tests
 */
export function setupPuppet(): void {
  afterAll(async () => {
    if (sharedBrowser) {
      await sharedBrowser.close().catch(() => {});
      sharedBrowser = null;
    }
  });
}

/**
 * Re-export expect with extended matchers
 */
export const expect = baseExpect;

/**
 * Re-export describe and other test utilities
 */
export { beforeAll, afterAll } from 'vitest';
export const describe = baseDescribe;
export const it = test;
