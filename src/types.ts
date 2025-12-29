import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserOptions {
  /** Run browser in headless mode. Default: false (shows browser window) */
  headless?: boolean;
  /** Browser viewport size */
  viewport?: {
    width: number;
    height: number;
  };
  /** Custom user agent string */
  userAgent?: string;
  /** Slow down operations by specified milliseconds (useful for debugging) */
  slowMo?: number;
}

export interface CursorOptions {
  /** Base movement speed multiplier. Default: 1 */
  moveSpeed?: number;
  /** Add random hesitation before actions. Default: true */
  hesitation?: boolean;
  /** Cursor overshoot spread for realistic movement. Default: 10 */
  overshootSpread?: number;
}

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

// Re-export Playwright types for convenience
export type { Browser, BrowserContext, Page } from 'playwright';
