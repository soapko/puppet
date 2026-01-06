import type { Browser, BrowserContext, Page } from 'playwright';

export interface VideoOptions {
  /** Directory to save videos (default: './videos') */
  dir?: string;
  /** Video size - defaults to viewport size */
  size?: { width: number; height: number };
}

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
  /** Enable video recording with visual cursor */
  video?: boolean | VideoOptions;
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
  /** Whether video recording is enabled */
  videoEnabled: boolean;
}

export interface SessionOptions {
  /** Path to command file. Default: ~/.puppet/commands.json */
  commandFile?: string;
  /** Path to result file. Default: ~/.puppet/results.json */
  resultFile?: string;
  /** Path to status file. Default: ~/.puppet/status.json */
  statusFile?: string;
  /** Run browser in headless mode. Default: false */
  headless?: boolean;
  /** Browser viewport size */
  viewport?: {
    width: number;
    height: number;
  };
  /** Enable video recording with visual cursor */
  video?: boolean | VideoOptions;
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
  | 'waitForLoaded'
  | 'getUrl'
  | 'getTitle'
  | 'close'
  | 'setDialogAction'
  | 'getLastDialog'
  | 'clearState'
  | 'uploadFile'
  | 'switchToFrame'
  | 'switchToMain'
  | 'getFrames'
  | 'assertVisible'
  | 'assertHidden'
  | 'assertText'
  | 'assertValue'
  | 'assertChecked'
  | 'assertUnchecked'
  | 'assertEnabled'
  | 'assertDisabled'
  | 'assertUrl'
  | 'assertTitle'
  | 'assertCount'
  | 'getVideoPath';

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
  /** Path to failure screenshot (only present on failed commands) */
  screenshotPath?: string;
}

export interface RetryOptions {
  /** Maximum number of attempts. Default: 3 */
  maxAttempts?: number;
  /** Initial delay between retries in ms. Default: 100 */
  initialDelay?: number;
  /** Maximum delay between retries in ms. Default: 2000 */
  maxDelay?: number;
  /** Backoff multiplier. Default: 2 */
  backoffMultiplier?: number;
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
  /** Send a command directly to the session (bypasses file IPC) */
  command(cmd: Omit<Command, 'id'>): Promise<CommandResult>;
}

// Re-export Playwright types for convenience
export type { Browser, BrowserContext, Page } from 'playwright';
