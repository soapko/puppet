// Browser management
export { launchBrowser, createContext, createPage, getBrowser } from './browser.js';

// Human cursor
export { Cursor, createCursor } from './cursor.js';

// Interactive session
export { startSession, sendCommand } from './session.js';

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
  Browser,
  BrowserContext,
  Page,
} from './types.js';
