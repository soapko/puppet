// Browser management
export { launchBrowser, createContext, createPage, getBrowser } from './browser.js';

// Human cursor
export { Cursor, createCursor } from './cursor.js';

// Interactive session
export { startSession, sendCommand } from './session.js';

// HTTP server mode
export { serve, stopServer } from './server.js';
export type { ServerOptions } from './server.js';

// Stdio mode
export { runStdio } from './stdio.js';
export type { StdioOptions } from './stdio.js';

// WebSocket mode
export { serveWebSocket, stopWebSocketServer } from './websocket.js';
export type { WebSocketServerOptions } from './websocket.js';

// REPL mode
export { startRepl } from './repl.js';
export type { ReplOptions } from './repl.js';

// Recording mode
export { startRecording, generateTestCode, simplifySelector } from './recorder/index.js';
export type { RecordOptions, RecordedEvent, GeneratorOptions } from './recorder/index.js';

// Fluent API
export { puppet, withBrowser, Browser } from './fluent.js';

// Selector utilities
export { testid, resolveSelector } from './selectors.js';

// Utilities
export { withRetry, executeWithOptionalRetry } from './retry.js';
export { getElementErrorContext, formatElementError, isElementNotFoundError } from './errors.js';

// Visual cursor for video recording
export {
  injectVisualCursor,
  setupVisualCursor,
  moveVisualCursor,
  triggerClickEffect,
} from './visual-cursor.js';

// Types
export type {
  BrowserOptions,
  CursorOptions,
  BrowserInstance,
  SessionOptions,
  VideoOptions,
  Command,
  CommandAction,
  CommandResult,
  Session,
  RetryOptions,
  // Playwright types available via 'playwright' import if needed
  BrowserContext,
  Page,
} from './types.js';
