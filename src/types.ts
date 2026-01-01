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

export interface SessionOptions {
  /** Path to command file. Default: ~/.puppet/commands.json */
  commandFile?: string;
  /** Path to result file. Default: ~/.puppet/results.json */
  resultFile?: string;
  /** Run browser in headless mode. Default: false */
  headless?: boolean;
  /** Browser viewport size */
  viewport?: {
    width: number;
    height: number;
  };
}

export type CommandAction =
  | 'init'
  | 'noop'
  | 'goto'
  | 'click'
  | 'clear'
  | 'type'
  | 'scroll'
  | 'screenshot'
  | 'evaluate'
  | 'waitFor'
  | 'getUrl'
  | 'getTitle'
  | 'close'
  | 'setDialogAction'
  | 'getLastDialog';

export interface Command {
  id: string;
  action: CommandAction;
  params?: Record<string, unknown>;
}

export interface CommandResult {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface Session {
  /** Close the session and browser */
  close(): Promise<void>;
  /** Get the current page URL */
  getUrl(): string;
  /** Check if session is running and browser is connected */
  isRunning(): boolean;
  /** Check if browser is still connected */
  isBrowserConnected(): boolean;
  /** Restart the session with a fresh browser */
  restart(): Promise<void>;
}

// Re-export Playwright types for convenience
export type { Browser, BrowserContext, Page } from 'playwright';
