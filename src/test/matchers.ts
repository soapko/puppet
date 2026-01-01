/**
 * Custom Vitest matchers for browser testing
 */

import type { Browser } from '../fluent.js';

/**
 * Custom matcher result
 */
interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * Custom matchers for Browser assertions
 */
export const puppetMatchers = {
  /**
   * Assert current URL matches expected
   *
   * @example
   * await expect(browser).toHaveURL('/dashboard');
   * await expect(browser).toHaveURL('https://example.com/dashboard');
   */
  async toHaveURL(browser: Browser, expected: string): Promise<MatcherResult> {
    const actual = await browser.url();
    const pass = expected.startsWith('/')
      ? actual.endsWith(expected) || actual.includes(expected)
      : actual === expected || actual.includes(expected);

    return {
      pass,
      message: () =>
        pass
          ? `Expected URL not to match "${expected}", but got "${actual}"`
          : `Expected URL to match "${expected}", but got "${actual}"`,
    };
  },

  /**
   * Assert element has expected text content
   *
   * @example
   * await expect(browser).toHaveText('welcome', 'Hello, User');
   */
  async toHaveText(browser: Browser, selector: string, expected: string): Promise<MatcherResult> {
    const actual = await browser.text(selector);
    const pass = actual.includes(expected);

    return {
      pass,
      message: () =>
        pass
          ? `Expected "${selector}" not to have text "${expected}", but got "${actual}"`
          : `Expected "${selector}" to have text "${expected}", but got "${actual}"`,
    };
  },

  /**
   * Assert element is visible
   *
   * @example
   * await expect(browser).toBeVisible('login-form');
   */
  async toBeVisible(browser: Browser, selector: string): Promise<MatcherResult> {
    try {
      await browser.assertVisible(selector);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to be visible`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${selector}" to be visible`,
      };
    }
  },

  /**
   * Assert element is hidden
   *
   * @example
   * await expect(browser).toBeHidden('loading-spinner');
   */
  async toBeHidden(browser: Browser, selector: string): Promise<MatcherResult> {
    try {
      await browser.assertHidden(selector);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to be hidden`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${selector}" to be hidden`,
      };
    }
  },

  /**
   * Assert input has expected value
   *
   * @example
   * await expect(browser).toHaveValue('email-input', 'user@example.com');
   */
  async toHaveValue(browser: Browser, selector: string, expected: string): Promise<MatcherResult> {
    const actual = await browser.value(selector);
    const pass = actual === expected;

    return {
      pass,
      message: () =>
        pass
          ? `Expected "${selector}" not to have value "${expected}"`
          : `Expected "${selector}" to have value "${expected}", but got "${actual}"`,
    };
  },

  /**
   * Assert page title matches
   *
   * @example
   * await expect(browser).toHaveTitle('Dashboard');
   */
  async toHaveTitle(browser: Browser, expected: string): Promise<MatcherResult> {
    const actual = await browser.title();
    const pass = actual.includes(expected);

    return {
      pass,
      message: () =>
        pass
          ? `Expected title not to match "${expected}", but got "${actual}"`
          : `Expected title to match "${expected}", but got "${actual}"`,
    };
  },

  /**
   * Assert checkbox is checked
   *
   * @example
   * await expect(browser).toBeChecked('remember-me');
   */
  async toBeChecked(browser: Browser, selector: string): Promise<MatcherResult> {
    try {
      await browser.assertChecked(selector);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to be checked`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${selector}" to be checked`,
      };
    }
  },

  /**
   * Assert element is enabled
   *
   * @example
   * await expect(browser).toBeEnabled('submit-btn');
   */
  async toBeEnabled(browser: Browser, selector: string): Promise<MatcherResult> {
    try {
      await browser.assertEnabled(selector);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to be enabled`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${selector}" to be enabled`,
      };
    }
  },

  /**
   * Assert element is disabled
   *
   * @example
   * await expect(browser).toBeDisabled('submit-btn');
   */
  async toBeDisabled(browser: Browser, selector: string): Promise<MatcherResult> {
    try {
      await browser.assertDisabled(selector);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to be disabled`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${selector}" to be disabled`,
      };
    }
  },

  /**
   * Assert number of matching elements
   *
   * @example
   * await expect(browser).toHaveCount('list-item', 5);
   */
  async toHaveCount(browser: Browser, selector: string, expected: number): Promise<MatcherResult> {
    try {
      await browser.assertCount(selector, expected);
      return {
        pass: true,
        message: () => `Expected "${selector}" not to have count ${expected}`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () =>
          `Expected "${selector}" to have count ${expected}: ${error instanceof Error ? error.message : error}`,
      };
    }
  },
};

/**
 * Type declarations for custom matchers
 */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toHaveURL(expected: string): Promise<void>;
    toHaveText(selector: string, expected: string): Promise<void>;
    toBeVisible(selector: string): Promise<void>;
    toBeHidden(selector: string): Promise<void>;
    toHaveValue(selector: string, expected: string): Promise<void>;
    toHaveTitle(expected: string): Promise<void>;
    toBeChecked(selector: string): Promise<void>;
    toBeEnabled(selector: string): Promise<void>;
    toBeDisabled(selector: string): Promise<void>;
    toHaveCount(selector: string, expected: number): Promise<void>;
  }
}
