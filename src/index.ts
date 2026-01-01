// Browser management
export { launchBrowser, createContext, createPage, getBrowser } from './browser.js';

// Human cursor
export { Cursor, createCursor } from './cursor.js';

// Interactive session
export { startSession, sendCommand } from './session.js';

// Fluent API
export { puppet, withBrowser, Browser } from './fluent.js';

// Selector utilities
export { testid, resolveSelector } from './selectors.js';

// Utilities
export { withRetry, executeWithOptionalRetry } from './retry.js';
export { getElementErrorContext, formatElementError, isElementNotFoundError } from './errors.js';

// Types
export type {
  BrowserOptions,
  CursorOptions,
  BrowserInstance,
  SessionOptions,
  Command,
  CommandAction,
  CommandResult,
  Session,
  RetryOptions,
  // Playwright types available via 'playwright' import if needed
  BrowserContext,
  Page,
} from './types.js';
