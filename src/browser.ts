import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

import { startCDPProxy, type CDPProxy } from './cdp-proxy.js';
import { CDPScreenRecorder } from './cdp-screencast.js';
import {
  DirectCDPSession,
  getDirectCDPSession,
  type CDPSessionLike,
} from './direct-cdp-session.js';
import type { BrowserOptions, BrowserInstance, VideoOptions } from './types.js';
import { setupVisualCursor, setupVisualCursorCDP } from './visual-cursor.js';

const log = {
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.error(`[puppet:browser] ${msg}`, ...args);
  },
};

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
 * Check if a CDP endpoint has webview targets that need proxying.
 */
async function hasWebviewTargets(cdpUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${cdpUrl}/json`);
    const targets = (await resp.json()) as Array<{ type: string }>;
    return targets.some(t => t.type === 'webview');
  } catch {
    return false;
  }
}

/**
 * Connect to an existing browser via Chrome DevTools Protocol (CDP)
 *
 * Automatically detects Electron webview targets and uses a CDP proxy
 * to make them accessible as regular Playwright pages.
 *
 * @param cdpUrl - CDP endpoint URL (e.g., 'http://localhost:9222')
 * @param options - Browser options (viewport, userAgent, cdpPageUrl)
 *
 * @example
 * ```typescript
 * const { browser, page } = await connectCDP('http://localhost:9222');
 * await page.goto('https://example.com');
 * // browser.close() disconnects without killing the remote browser
 * ```
 */
export async function connectCDP(
  cdpUrl: string,
  options: BrowserOptions = {}
): Promise<BrowserInstance> {
  // Check if the CDP endpoint has webview targets (e.g. Electron app)
  // If so, use a proxy to rewrite webview targets as page targets
  let proxy: CDPProxy | undefined;
  let connectUrl = cdpUrl;
  const needsProxy = await hasWebviewTargets(cdpUrl);
  if (needsProxy) {
    proxy = await startCDPProxy(cdpUrl);
    connectUrl = proxy.url;
  }

  const browser = await chromium.connectOverCDP(connectUrl);
  const contexts = browser.contexts();

  // Reuse existing context or create a new one
  let context: BrowserContext;
  if (contexts.length > 0) {
    context = contexts[0];
  } else {
    const { viewport = DEFAULT_VIEWPORT, userAgent = DEFAULT_USER_AGENT } = options;
    context = await browser.newContext({ viewport, userAgent });
  }

  // Find page matching cdpPageUrl or use first existing page
  const pages = context.pages();
  let page: Page;
  if (options.cdpPageUrl) {
    const match = pages.find(p => p.url().includes(options.cdpPageUrl!));
    page = match || pages[0] || (await context.newPage());
  } else {
    page = pages[0] || (await context.newPage());
  }

  // Set up visual cursor via CDP session (persists across navigations)
  // Uses Page.addScriptToEvaluateOnNewDocument — works on reused CDP contexts
  // where context.addInitScript() does not
  // Auto-enable cursor when video is requested (same as non-CDP path)
  const showCursor = options.showCursor || !!options.video;
  log.debug('connectCDP showCursor option:', showCursor);
  if (showCursor) {
    log.debug('connectCDP calling setupVisualCursorCDP');
    await setupVisualCursorCDP(page);
  } else {
    log.debug('connectCDP skipping visual cursor (showCursor not set)');
  }

  // CDP video recording via screencast → ffmpeg
  // For webview targets (proxy active), use a direct WS connection to the target
  // because Electron's browser-level WS doesn't multiplex domain events
  // (e.g. Page.screencastFrame) back through session multiplexing.
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  let screenRecorder: CDPScreenRecorder | undefined;
  let directCDPSession: DirectCDPSession | undefined;
  const videoOptions = parseVideoOptions(options.video, viewport);
  if (videoOptions) {
    let cdpSession: CDPSessionLike;
    if (needsProxy) {
      // Direct connection to target's own WS URL — events flow correctly
      log.debug('Using direct CDP session for screencast (webview target)');
      const session = await getDirectCDPSession(cdpUrl, page.url());
      if (session) {
        directCDPSession = session;
        cdpSession = session;
      } else {
        log.debug('Direct session not found, falling back to Playwright CDP session');
        cdpSession = (await page.context().newCDPSession(page)) as unknown as CDPSessionLike;
      }
    } else {
      cdpSession = (await page.context().newCDPSession(page)) as unknown as CDPSessionLike;
    }
    const outputPath = `${videoOptions.dir}/${Date.now()}.webm`;
    screenRecorder = new CDPScreenRecorder(cdpSession, {
      outputPath,
      fps: 25,
      quality: 80,
      maxWidth: viewport.width,
      maxHeight: viewport.height,
    });
    await screenRecorder.start();
  }

  return {
    browser,
    context,
    page,
    videoEnabled: !!screenRecorder,
    cleanup: proxy ? () => proxy.close() : undefined,
    screenRecorder,
    directCDPSession,
  };
}

/**
 * Convenience function to get a ready-to-use browser, context, and page
 *
 * If `options.cdp` is set, connects to an existing browser via CDP instead
 * of launching a new one.
 *
 * @example
 * ```typescript
 * const { browser, page } = await getBrowser({ headless: false });
 * await page.goto('https://example.com');
 * // ... interact with the page
 * await browser.close();
 * ```
 *
 * @example CDP connection
 * ```typescript
 * const { browser, page } = await getBrowser({ cdp: 'http://localhost:9222' });
 * await page.goto('https://example.com');
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
  // CDP connection path
  if (options.cdp) {
    return connectCDP(options.cdp, options);
  }

  // Standard launch path
  const browser = await launchBrowser(options);
  const context = await createContext(browser, options);
  const page = await createPage(context);
  const videoEnabled = Boolean(options.video);

  return { browser, context, page, videoEnabled };
}
