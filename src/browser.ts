import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { BrowserOptions, BrowserInstance } from './types.js';

/** Default viewport mimicking common desktop resolution */
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

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

/**
 * Create a browser context with optional viewport and user agent
 */
export async function createContext(
  browser: Browser,
  options: BrowserOptions = {}
): Promise<BrowserContext> {
  const { viewport = DEFAULT_VIEWPORT, userAgent = DEFAULT_USER_AGENT } = options;

  return browser.newContext({
    viewport,
    userAgent,
    locale: 'en-US',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
  });
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
 */
export async function getBrowser(options: BrowserOptions = {}): Promise<BrowserInstance> {
  const browser = await launchBrowser(options);
  const context = await createContext(browser, options);
  const page = await createPage(context);

  return { browser, context, page };
}
