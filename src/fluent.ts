/**
 * Fluent API wrapper for puppet
 *
 * Provides an intuitive, method-based interface for browser automation.
 */

import { resolveSelector } from './selectors.js';
import { startSession, sendCommand } from './session.js';
import type { CommandAction, SessionOptions, CommandResult, Session } from './types.js';

/**
 * Browser class providing fluent API for browser automation
 */
export class Browser {
  private session: Session | null = null;
  private options: SessionOptions;

  constructor(options: SessionOptions = {}) {
    this.options = options;
  }

  /**
   * Initialize the browser session
   * @internal Called by puppet() factory function
   */
  async init(): Promise<this> {
    this.session = await startSession(this.options);
    return this;
  }

  /**
   * Navigate to a URL
   */
  async goto(url: string): Promise<void> {
    await this.send('goto', { url });
  }

  /**
   * Click an element
   * @param selector - CSS selector or testid (bare string = testid)
   */
  async click(selector: string): Promise<void> {
    await this.send('click', { selector: resolveSelector(selector) });
  }

  /**
   * Type text into an element
   * @param selector - CSS selector or testid
   * @param text - Text to type
   */
  async type(selector: string, text: string): Promise<void> {
    await this.send('type', { selector: resolveSelector(selector), text });
  }

  /**
   * Clear an input field
   * @param selector - CSS selector or testid
   */
  async clear(selector: string): Promise<void> {
    await this.send('clear', { selector: resolveSelector(selector) });
  }

  /**
   * Get text content of an element
   * @param selector - CSS selector or testid
   * @returns Text content
   */
  async text(selector: string): Promise<string> {
    const result = await this.send('evaluate', {
      script: `document.querySelector('${resolveSelector(selector)}')?.textContent ?? ''`,
    });
    return result.result as string;
  }

  /**
   * Get value of an input element
   * @param selector - CSS selector or testid
   * @returns Input value
   */
  async value(selector: string): Promise<string> {
    const result = await this.send('evaluate', {
      script: `document.querySelector('${resolveSelector(selector)}')?.value ?? ''`,
    });
    return result.result as string;
  }

  /**
   * Get HTML content
   * @param selector - Optional CSS selector or testid. If omitted, returns full page HTML.
   * @returns HTML content
   */
  async html(selector?: string): Promise<string> {
    if (selector) {
      const result = await this.send('evaluate', {
        script: `document.querySelector('${resolveSelector(selector)}')?.outerHTML ?? ''`,
      });
      return result.result as string;
    }
    const result = await this.send('evaluate', {
      script: 'document.documentElement.outerHTML',
    });
    return result.result as string;
  }

  /**
   * Take a screenshot
   * @param options - Optional path to save screenshot, or options object
   * @returns Base64-encoded screenshot
   */
  async screenshot(options?: string | { path?: string; fullPage?: boolean }): Promise<string> {
    const params: Record<string, unknown> = {};
    if (typeof options === 'string') {
      params.path = options;
    } else if (options) {
      if (options.path) params.path = options.path;
      if (options.fullPage) params.fullPage = options.fullPage;
    }
    const result = await this.send('screenshot', params);
    return result.result as string;
  }

  /**
   * Select an option from a dropdown
   * @param selector - CSS selector or testid
   * @param value - Value to select
   */
  async select(selector: string, value: string): Promise<void> {
    const sel = resolveSelector(selector);
    await this.send('evaluate', {
      script: `document.querySelector('${sel}').value = '${value}'; document.querySelector('${sel}').dispatchEvent(new Event('change', { bubbles: true }))`,
    });
  }

  /**
   * Check a checkbox
   * @param selector - CSS selector or testid
   */
  async check(selector: string): Promise<void> {
    const sel = resolveSelector(selector);
    await this.send('evaluate', {
      script: `const el = document.querySelector('${sel}'); if (!el.checked) el.click()`,
    });
  }

  /**
   * Uncheck a checkbox
   * @param selector - CSS selector or testid
   */
  async uncheck(selector: string): Promise<void> {
    const sel = resolveSelector(selector);
    await this.send('evaluate', {
      script: `const el = document.querySelector('${sel}'); if (el.checked) el.click()`,
    });
  }

  /**
   * Hover over an element
   * @param selector - CSS selector or testid
   */
  async hover(selector: string): Promise<void> {
    // Use evaluate to dispatch mouseover event since we don't have a hover action
    const sel = resolveSelector(selector);
    await this.send('evaluate', {
      script: `document.querySelector('${sel}')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`,
    });
  }

  /**
   * Scroll the page or element
   * @param direction - 'up' or 'down'
   * @param amount - Pixels to scroll (default: 300)
   */
  async scroll(direction: 'up' | 'down' = 'down', amount: number = 300): Promise<void> {
    await this.send('scroll', { direction, amount });
  }

  /**
   * Wait for specified milliseconds
   * @param ms - Milliseconds to wait
   */
  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for an element to appear
   * @param selector - CSS selector or testid
   * @param timeout - Optional timeout in ms (default: 5000)
   */
  async waitFor(selector: string, timeout?: number): Promise<void> {
    const params: Record<string, unknown> = { selector: resolveSelector(selector) };
    if (timeout !== undefined) params.timeout = timeout;
    await this.send('waitFor', params);
  }

  /**
   * Wait for page to finish loading (no loading indicators, network idle)
   * @param timeout - Optional timeout in ms (default: 10000)
   */
  async waitForLoaded(timeout?: number): Promise<void> {
    const params: Record<string, unknown> = {};
    if (timeout !== undefined) params.timeout = timeout;
    await this.send('waitForLoaded', params);
  }

  /**
   * Evaluate JavaScript in the page
   * @param script - JavaScript code to execute
   * @returns Result of evaluation
   */
  async evaluate<T = unknown>(script: string): Promise<T> {
    const result = await this.send('evaluate', { script });
    return result.result as T;
  }

  /**
   * Upload file(s) to a file input
   * @param selector - CSS selector or testid of file input
   * @param filePath - Path to file or array of paths
   */
  async upload(selector: string, filePath: string | string[]): Promise<void> {
    await this.send('uploadFile', {
      selector: resolveSelector(selector),
      filePath,
    });
  }

  /**
   * Switch to an iframe
   * @param selector - CSS selector or testid of iframe
   */
  async frame(selector: string): Promise<void> {
    await this.send('switchToFrame', { selector: resolveSelector(selector) });
  }

  /**
   * Switch back to main frame
   */
  async mainFrame(): Promise<void> {
    await this.send('switchToMain', {});
  }

  /**
   * Get current URL
   * @returns Current page URL
   */
  async url(): Promise<string> {
    const result = await this.send('getUrl', {});
    return result.result as string;
  }

  /**
   * Get page title
   * @returns Page title
   */
  async title(): Promise<string> {
    const result = await this.send('getTitle', {});
    return result.result as string;
  }

  /**
   * Clear cookies, localStorage, and sessionStorage
   * @param options - Optional: include IndexedDB clearing
   */
  async clearState(options?: { includeIndexedDB?: boolean }): Promise<void> {
    await this.send('clearState', options ?? {});
  }

  /**
   * Set dialog action (accept or dismiss) for alerts/confirms/prompts
   * @param action - 'accept' or 'dismiss'
   */
  async setDialogAction(action: 'accept' | 'dismiss'): Promise<void> {
    await this.send('setDialogAction', { action });
  }

  /**
   * Get the message from the last dialog
   * @returns Last dialog message
   */
  async getLastDialog(): Promise<string> {
    const result = await this.send('getLastDialog', {});
    return result.result as string;
  }

  // ============ Assertions ============

  /**
   * Assert an element is visible
   * @param selector - CSS selector or testid
   */
  async assertVisible(selector: string): Promise<void> {
    await this.send('assertVisible', { selector: resolveSelector(selector) });
  }

  /**
   * Assert an element is hidden or not present
   * @param selector - CSS selector or testid
   */
  async assertHidden(selector: string): Promise<void> {
    await this.send('assertHidden', { selector: resolveSelector(selector) });
  }

  /**
   * Assert element text content matches
   * @param selector - CSS selector or testid
   * @param expected - Expected text
   * @param exact - If true (default), text must match exactly. If false, text must contain expected.
   */
  async assertText(selector: string, expected: string, exact = true): Promise<void> {
    await this.send('assertText', { selector: resolveSelector(selector), expected, exact });
  }

  /**
   * Assert input value matches
   * @param selector - CSS selector or testid
   * @param expected - Expected value
   */
  async assertValue(selector: string, expected: string): Promise<void> {
    await this.send('assertValue', { selector: resolveSelector(selector), expected });
  }

  /**
   * Assert checkbox/radio is checked
   * @param selector - CSS selector or testid
   */
  async assertChecked(selector: string): Promise<void> {
    await this.send('assertChecked', { selector: resolveSelector(selector) });
  }

  /**
   * Assert checkbox/radio is not checked
   * @param selector - CSS selector or testid
   */
  async assertUnchecked(selector: string): Promise<void> {
    await this.send('assertUnchecked', { selector: resolveSelector(selector) });
  }

  /**
   * Assert element is enabled
   * @param selector - CSS selector or testid
   */
  async assertEnabled(selector: string): Promise<void> {
    await this.send('assertEnabled', { selector: resolveSelector(selector) });
  }

  /**
   * Assert element is disabled
   * @param selector - CSS selector or testid
   */
  async assertDisabled(selector: string): Promise<void> {
    await this.send('assertDisabled', { selector: resolveSelector(selector) });
  }

  /**
   * Assert current URL matches
   * @param expected - Expected URL
   * @param exact - If true (default), URL must match exactly. If false, URL must contain expected.
   */
  async assertUrl(expected: string, exact = true): Promise<void> {
    await this.send('assertUrl', { expected, exact });
  }

  /**
   * Assert page title matches
   * @param expected - Expected title
   * @param exact - If true (default), title must match exactly. If false, title must contain expected.
   */
  async assertTitle(expected: string, exact = true): Promise<void> {
    await this.send('assertTitle', { expected, exact });
  }

  /**
   * Assert number of matching elements
   * @param selector - CSS selector or testid
   * @param count - Expected count
   */
  async assertCount(selector: string, count: number): Promise<void> {
    await this.send('assertCount', { selector: resolveSelector(selector), count });
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    await this.send('close', {});
    this.session = null;
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.session?.isRunning() ?? false;
  }

  /**
   * Restart the browser session
   */
  async restart(): Promise<void> {
    await this.session?.restart();
  }

  /**
   * Send a command to the session
   * @internal
   */
  private async send(
    action: CommandAction,
    params: Record<string, unknown>
  ): Promise<CommandResult> {
    const result = await sendCommand({ action, params });
    if (!result.success) {
      throw new Error(result.error ?? `Command ${action} failed`);
    }
    return result;
  }

  /**
   * Run a function with automatic browser cleanup
   * @param fn - Function to run with browser
   * @param options - Session options
   * @returns Result of function
   */
  static async run<T>(fn: (browser: Browser) => Promise<T>, options?: SessionOptions): Promise<T> {
    return withBrowser(fn, options);
  }
}

/**
 * Create and initialize a browser instance
 * @param options - Session options
 * @returns Initialized browser instance
 *
 * @example
 * ```typescript
 * const browser = await puppet({ headless: false });
 * await browser.goto('https://example.com');
 * await browser.click('submit-btn');
 * await browser.close();
 * ```
 */
export async function puppet(options: SessionOptions = {}): Promise<Browser> {
  const browser = new Browser(options);
  return browser.init();
}

/**
 * Run a function with automatic browser lifecycle management
 * Browser is automatically closed when function completes or throws.
 *
 * @param fn - Function to run with browser
 * @param options - Session options
 * @returns Result of function
 *
 * @example
 * ```typescript
 * await withBrowser(async (browser) => {
 *   await browser.goto('https://example.com');
 *   await browser.click('submit');
 * });
 * // Browser is automatically closed
 * ```
 */
export async function withBrowser<T>(
  fn: (browser: Browser) => Promise<T>,
  options: SessionOptions = {}
): Promise<T> {
  const browser = await puppet(options);
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {
      // Ignore close errors - browser may already be closed
    });
  }
}
