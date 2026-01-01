import { watch, type FSWatcher } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { dirname } from 'path';

import { getBrowser } from './browser.js';
import { createCursor } from './cursor.js';
import type { SessionOptions, Command, CommandResult, Session } from './types.js';

const DEFAULT_COMMAND_FILE = `${homedir()}/.puppet/commands.json`;
const DEFAULT_RESULT_FILE = `${homedir()}/.puppet/results.json`;
const DEFAULT_STATUS_FILE = `${homedir()}/.puppet/status.json`;

export interface SessionStatus {
  running: boolean;
  browserConnected: boolean;
  lastUpdated: number;
}

/**
 * Check if an error indicates the browser/page is dead
 */
function isBrowserDeadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('target closed') ||
    msg.includes('browser has been closed') ||
    msg.includes('context has been closed') ||
    msg.includes('page has been closed') ||
    msg.includes('browser.newcontext') ||
    msg.includes('has been closed')
  );
}

// Simple logger for session debugging
const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[puppet:session] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[puppet:session] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.log(`[puppet:session:debug] ${msg}`, ...args);
  },
};

/**
 * Start an interactive browser session that watches for commands
 */
export async function startSession(options: SessionOptions = {}): Promise<Session> {
  const commandFile = options.commandFile ?? DEFAULT_COMMAND_FILE;
  const resultFile = options.resultFile ?? DEFAULT_RESULT_FILE;
  const statusFile = options.statusFile ?? DEFAULT_STATUS_FILE;

  // Ensure directories exist
  log.debug('Creating directories for command/result/status files');
  await mkdir(dirname(commandFile), { recursive: true });
  await mkdir(dirname(resultFile), { recursive: true });
  await mkdir(dirname(statusFile), { recursive: true });

  // Initialize command file if it doesn't exist
  try {
    await readFile(commandFile, 'utf-8');
    log.debug('Command file exists');
  } catch {
    log.info('Initializing command file:', commandFile);
    await writeFile(commandFile, JSON.stringify({ id: '', action: 'noop' }, null, 2));
  }

  // Launch browser
  log.info('Launching browser...');
  let { browser, page } = await getBrowser({
    headless: options.headless ?? false,
    viewport: options.viewport,
  });
  log.info('Browser launched');

  let cursor = createCursor(page);
  let running = true;
  let browserConnected = true;

  // Dialog handling state
  let dialogAction: 'accept' | 'dismiss' = 'accept';
  let lastDialogMessage = '';

  /**
   * Write current session status to file for external processes to check
   */
  async function writeStatus() {
    const status: SessionStatus = {
      running: running && browserConnected,
      browserConnected,
      lastUpdated: Date.now(),
    };
    try {
      await writeFile(statusFile, JSON.stringify(status, null, 2));
    } catch (err) {
      log.debug('Failed to write status file:', err);
    }
  }

  // Write initial status
  await writeStatus();

  /**
   * Attach event listeners to browser and page
   */
  function attachEventListeners() {
    // Handle browser disconnect
    browser.on('disconnected', () => {
      log.error('Browser disconnected unexpectedly');
      browserConnected = false;
      running = false;
      writeStatus(); // Update status file for external processes
    });

    // Handle page close
    page.on('close', () => {
      log.error('Page closed unexpectedly');
      running = false;
      writeStatus(); // Update status file for external processes
    });

    // Auto-accept dialogs (confirm, alert, prompt) for testing
    page.on('dialog', async dialog => {
      lastDialogMessage = dialog.message();
      log.info(`Dialog (${dialog.type()}): "${lastDialogMessage}" - ${dialogAction}ing`);
      if (dialogAction === 'accept') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  attachEventListeners();
  let lastCommandId = '';
  let watcher: FSWatcher | null = null;

  // Process a command
  async function processCommand(cmd: Command): Promise<CommandResult> {
    const { id, action, params = {} } = cmd;
    log.info(`Processing command: ${action} (id: ${id})`);
    log.debug('Command params:', params);

    // Health check - fail fast if browser is dead
    if (!browserConnected) {
      log.error('Cannot process command: browser is disconnected');
      return {
        id,
        success: false,
        error: 'Browser disconnected. Call restart() to recover.',
      };
    }

    try {
      let result: unknown = null;

      switch (action) {
        case 'init':
        case 'noop':
          // No-op commands for session initialization
          break;

        case 'goto':
          await page.goto(params.url as string);
          break;

        case 'click':
          await cursor.click(params.selector as string);
          break;

        case 'clear':
          await page.locator(params.selector as string).clear();
          break;

        case 'type':
          await cursor.type(params.selector as string, params.text as string);
          break;

        case 'scroll':
          await cursor.scroll(
            (params.direction as 'up' | 'down') ?? 'down',
            (params.amount as number) ?? 300
          );
          break;

        case 'screenshot': {
          const buffer = await page.screenshot({
            fullPage: params.fullPage as boolean,
          });
          result = buffer.toString('base64');
          break;
        }

        case 'evaluate':
          result = await page.evaluate(params.script as string);
          break;

        case 'waitFor':
          await page.waitForSelector(params.selector as string, {
            timeout: (params.timeout as number) ?? 5000,
          });
          break;

        case 'getUrl':
          result = page.url();
          break;

        case 'getTitle':
          result = await page.title();
          break;

        case 'close':
          running = false;
          break;

        case 'setDialogAction':
          dialogAction = (params.action as 'accept' | 'dismiss') ?? 'accept';
          result = dialogAction;
          break;

        case 'getLastDialog':
          result = lastDialogMessage;
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      log.info(`Command ${action} completed successfully`);
      return { id, success: true, result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Command ${action} failed:`, errorMsg);

      // Detect if browser died during command execution
      if (isBrowserDeadError(err)) {
        log.error('Browser appears to be dead, marking session as disconnected');
        browserConnected = false;
        running = false;
      }

      return {
        id,
        success: false,
        error: browserConnected ? errorMsg : `${errorMsg} (browser disconnected)`,
      };
    }
  }

  // Check for new commands
  async function checkCommands() {
    if (!running) return;

    try {
      const content = await readFile(commandFile, 'utf-8');
      const cmd = JSON.parse(content) as Command;

      // Skip if same command or no id
      if (!cmd.id || cmd.id === lastCommandId) return;

      log.debug(`New command detected: ${cmd.action} (id: ${cmd.id})`);
      lastCommandId = cmd.id;

      // Process and write result
      const result = await processCommand(cmd);
      await writeFile(resultFile, JSON.stringify(result, null, 2));
      log.debug('Result written to:', resultFile);

      // Handle close command
      if (cmd.action === 'close') {
        log.info('Close command received, shutting down');
        await cleanup();
      }
    } catch (err) {
      // Only log actual errors, not parse errors from mid-write
      if (err instanceof SyntaxError) {
        log.debug('Command file parse error (likely mid-write)');
      } else if (err instanceof Error && err.message.includes('ENOENT')) {
        log.debug('Command file not found');
      } else {
        log.error('Error checking commands:', err);
      }
    }
  }

  // Cleanup function
  async function cleanup() {
    log.info('Cleaning up session...');
    running = false;
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    // Only try to close browser if it's still connected
    if (browserConnected) {
      try {
        await browser.close();
        log.info('Browser closed');
      } catch (err) {
        log.debug('Browser already closed or errored during close:', err);
      }
    }
    browserConnected = false;
    await writeStatus(); // Update status file
  }

  // Start watching for commands
  log.info('Starting file watcher on:', commandFile);
  watcher = watch(commandFile, { persistent: true }, () => {
    checkCommands();
  });

  // Handle watcher errors
  watcher.on('error', err => {
    log.error('File watcher error:', err);
  });

  // Also poll periodically in case watch misses events
  const pollInterval = setInterval(() => {
    if (running) {
      checkCommands();
    } else {
      clearInterval(pollInterval);
    }
  }, 100);

  log.info('Session ready, waiting for commands...');

  // Return session handle
  return {
    async close() {
      await cleanup();
      clearInterval(pollInterval);
    },

    getUrl() {
      return page.url();
    },

    isRunning() {
      return running && browserConnected;
    },

    isBrowserConnected() {
      return browserConnected;
    },

    async restart() {
      log.info('Restarting session...');

      // Clean up existing session
      await cleanup();

      // Launch new browser
      log.info('Launching new browser...');
      const newInstance = await getBrowser({
        headless: options.headless ?? false,
        viewport: options.viewport,
      });
      browser = newInstance.browser;
      page = newInstance.page;
      cursor = createCursor(page);

      // Reset state
      browserConnected = true;
      running = true;
      lastCommandId = '';
      dialogAction = 'accept';
      lastDialogMessage = '';

      // Reattach event listeners
      attachEventListeners();

      // Restart file watcher
      log.info('Restarting file watcher on:', commandFile);
      watcher = watch(commandFile, { persistent: true }, () => {
        checkCommands();
      });
      watcher.on('error', err => {
        log.error('File watcher error:', err);
      });

      // Update status file
      await writeStatus();

      log.info('Session restarted and ready');
    },
  };
}

/**
 * Check if session is running by reading the status file
 */
async function checkSessionStatus(
  statusFile: string
): Promise<{ running: boolean; error?: string }> {
  try {
    const content = await readFile(statusFile, 'utf-8');
    const status = JSON.parse(content) as SessionStatus;
    if (!status.running) {
      return {
        running: false,
        error: status.browserConnected
          ? 'Session is not running'
          : 'Browser disconnected. Call restart() to recover.',
      };
    }
    return { running: true };
  } catch {
    // Status file doesn't exist or is unreadable - session might not be started
    return { running: false, error: 'Session status unavailable. Is a session running?' };
  }
}

/**
 * Send a command to a running session and wait for result
 */
export async function sendCommand(
  command: Omit<Command, 'id'>,
  options: { commandFile?: string; resultFile?: string; statusFile?: string; timeout?: number } = {}
): Promise<CommandResult> {
  const commandFile = options.commandFile ?? DEFAULT_COMMAND_FILE;
  const resultFile = options.resultFile ?? DEFAULT_RESULT_FILE;
  const statusFile = options.statusFile ?? DEFAULT_STATUS_FILE;
  const timeout = options.timeout ?? 10000;

  // Check session status before sending command
  const status = await checkSessionStatus(statusFile);
  if (!status.running) {
    return {
      id: 'pre-check',
      success: false,
      error: status.error ?? 'Session is not running',
    };
  }

  const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cmd: Command = { id, ...command };

  // Write command
  await writeFile(commandFile, JSON.stringify(cmd, null, 2));

  // Wait for result, periodically checking session status
  const startTime = Date.now();
  let lastStatusCheck = startTime;

  while (Date.now() - startTime < timeout) {
    // Check for result
    try {
      const content = await readFile(resultFile, 'utf-8');
      const result = JSON.parse(content) as CommandResult;
      if (result.id === id) {
        return result;
      }
    } catch {
      // Ignore read errors
    }

    // Periodically check if session is still alive (every 500ms)
    if (Date.now() - lastStatusCheck > 500) {
      const currentStatus = await checkSessionStatus(statusFile);
      if (!currentStatus.running) {
        return {
          id,
          success: false,
          error: currentStatus.error ?? 'Session died while waiting for result',
        };
      }
      lastStatusCheck = Date.now();
    }

    await new Promise(r => setTimeout(r, 50));
  }

  throw new Error(`Command timed out after ${timeout}ms`);
}
