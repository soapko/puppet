/**
 * Test runner wrapper for Vitest
 *
 * Provides a `page` fixture that automatically manages browser lifecycle.
 */

import * as fs from 'fs';
import * as path from 'path';

import { test as baseTest, expect as baseExpect, afterAll, describe as baseDescribe } from 'vitest';

import { puppet, Browser } from '../fluent.js';
import type { VideoOptions } from '../types.js';

import { getConfig, type VideoConfig } from './config.js';
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
 * Parse video config into VideoOptions
 */
function parseVideoConfig(
  video: boolean | VideoConfig | undefined,
  videoDir: string
): VideoOptions | undefined {
  if (!video) return undefined;

  if (video === true) {
    return { dir: videoDir };
  }

  return {
    dir: video.dir ?? videoDir,
    size: video.size,
  };
}

/**
 * Create the test function with page fixture
 */
export const test = baseTest.extend<PuppetFixtures>({
  page: async ({ task }, use) => {
    const config = getConfig();

    // Parse video options
    const videoOptions = parseVideoConfig(config.video, config.videoDir);

    // Reuse browser instance if available
    if (!sharedBrowser || !sharedBrowser.isRunning()) {
      sharedBrowser = await puppet({
        headless: config.headless,
        viewport: config.viewport,
        video: videoOptions,
      });

      if (videoOptions) {
        console.log(`Video recording enabled, saving to: ${videoOptions.dir}`);
      }
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
      // Check if video was recorded
      try {
        const videoInfo = await sharedBrowser.getVideoPath();
        if (videoInfo.enabled && videoInfo.path) {
          console.log(`Video will be saved after close`);
        }
      } catch {
        // Ignore errors getting video path
      }

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
export { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
export const describe = baseDescribe;
export const it = test;
