import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

import type { BrowserOptions, BrowserInstance, VideoOptions } from './types.js';
import { setupVisualCursor } from './visual-cursor.js';

/** Default viewport mimicking common desktop resolution */
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/** Default user agent (Chrome on macOS) */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Launch a Chromium browser instance
 */
export async function launchBrowser(options: BrowserOptions = {}): Promise<Browser> {
  const { headless = false, slowMo } = options;

  return chromium.launch({
    headless,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
    ],
  });
}

/** Default video directory */
const DEFAULT_VIDEO_DIR = './videos';

/**
 * Parse video options from boolean or VideoOptions
 */
function parseVideoOptions(
  video: boolean | VideoOptions | undefined,
  viewport: { width: number; height: number }
): { dir: string; size: { width: number; height: number } } | null {
  if (!video) return null;

  if (video === true) {
    return { dir: DEFAULT_VIDEO_DIR, size: viewport };
  }

  return {
    dir: video.dir ?? DEFAULT_VIDEO_DIR,
    size: video.size ?? viewport,
  };
}

/**
 * Create a browser context with optional viewport and user agent
 */
export async function createContext(
  browser: Browser,
  options: BrowserOptions = {}
): Promise<BrowserContext> {
  const {
    viewport = DEFAULT_VIEWPORT,
    userAgent = DEFAULT_USER_AGENT,
    video,
    showCursor,
  } = options;

  const videoOptions = parseVideoOptions(video, viewport);

  const context = await browser.newContext({
    viewport,
    userAgent,
    locale: 'en-US',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
    ...(videoOptions && {
      recordVideo: {
        dir: videoOptions.dir,
        size: videoOptions.size,
      },
    }),
  });

  // Set up visual cursor if video recording is enabled or showCursor is true
  if (videoOptions || showCursor) {
    await setupVisualCursor(context);
  }

  return context;
}

/**
 * Create a new page from a browser context
 */
export async function createPage(context: BrowserContext): Promise<Page> {
  return context.newPage();
}

/**
 * Convenience function to get a ready-to-use browser, context, and page
 *
 * @example
 * ```typescript
 * const { browser, page } = await getBrowser({ headless: false });
 * await page.goto('https://example.com');
 * // ... interact with the page
 * await browser.close();
 * ```
 *
 * @example Video recording
 * ```typescript
 * const { browser, page, videoEnabled } = await getBrowser({
 *   video: { dir: './videos' }
 * });
 * await page.goto('https://example.com');
 * // ... interact with the page
 *
 * // Important: close context to finalize video
 * await context.close();
 *
 * // Get video path after context closes
 * const videoPath = await page.video()?.path();
 * ```
 */
export async function getBrowser(options: BrowserOptions = {}): Promise<BrowserInstance> {
  const browser = await launchBrowser(options);
  const context = await createContext(browser, options);
  const page = await createPage(context);
  const videoEnabled = Boolean(options.video);

  return { browser, context, page, videoEnabled };
}
