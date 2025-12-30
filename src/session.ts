import { watch, type FSWatcher } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { homedir } from 'os';
import type { Page, Browser } from 'playwright';
import { getBrowser } from './browser.js';
import { createCursor, Cursor } from './cursor.js';
import type { SessionOptions, Command, CommandResult, Session } from './types.js';

const DEFAULT_COMMAND_FILE = `${homedir()}/.puppet/commands.json`;
const DEFAULT_RESULT_FILE = `${homedir()}/.puppet/results.json`;

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

  // Ensure directories exist
  log.debug('Creating directories for command/result files');
  await mkdir(dirname(commandFile), { recursive: true });
  await mkdir(dirname(resultFile), { recursive: true });

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
  const { browser, page } = await getBrowser({
    headless: options.headless ?? false,
    viewport: options.viewport,
  });
  log.info('Browser launched');

  const cursor = createCursor(page);

  let running = true;
  let lastCommandId = '';
  let watcher: FSWatcher | null = null;

  // Process a command
  async function processCommand(cmd: Command): Promise<CommandResult> {
    const { id, action, params = {} } = cmd;
    log.info(`Processing command: ${action} (id: ${id})`);
    log.debug('Command params:', params);

    try {
      let result: unknown = null;

      switch (action) {
        case 'goto':
          await page.goto(params.url as string);
          break;

        case 'click':
          await cursor.click(params.selector as string);
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

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      log.info(`Command ${action} completed successfully`);
      return { id, success: true, result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Command ${action} failed:`, errorMsg);
      return {
        id,
        success: false,
        error: errorMsg,
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
    await browser.close();
    log.info('Browser closed');
  }

  // Start watching for commands
  log.info('Starting file watcher on:', commandFile);
  watcher = watch(commandFile, { persistent: true }, () => {
    checkCommands();
  });

  // Handle watcher errors
  watcher.on('error', (err) => {
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
      return running;
    },
  };
}

/**
 * Send a command to a running session and wait for result
 */
export async function sendCommand(
  command: Omit<Command, 'id'>,
  options: { commandFile?: string; resultFile?: string; timeout?: number } = {}
): Promise<CommandResult> {
  const commandFile = options.commandFile ?? DEFAULT_COMMAND_FILE;
  const resultFile = options.resultFile ?? DEFAULT_RESULT_FILE;
  const timeout = options.timeout ?? 10000;

  const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cmd: Command = { id, ...command };

  // Write command
  await writeFile(commandFile, JSON.stringify(cmd, null, 2));

  // Wait for result
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const content = await readFile(resultFile, 'utf-8');
      const result = JSON.parse(content) as CommandResult;
      if (result.id === id) {
        return result;
      }
    } catch {
      // Ignore errors
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  throw new Error(`Command timed out after ${timeout}ms`);
}
