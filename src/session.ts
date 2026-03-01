import { watch, type FSWatcher } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { dirname } from 'path';

import type { CDPSession, Frame, Page } from 'playwright';

import { getBrowser } from './browser.js';
import { createCursor } from './cursor.js';
import { getElementErrorContext, formatElementError, isElementNotFoundError } from './errors.js';
import { executeWithOptionalRetry } from './retry.js';
import { resolveSelector } from './selectors.js';
import type { SessionOptions, Command, CommandResult, Session, RetryOptions } from './types.js';

const FAILURE_SCREENSHOT_DIR = `${homedir()}/.puppet/failures`;

// Default loading selectors to wait for
const LOADING_SELECTORS = [
  '[data-loading="true"]',
  '[data-testid*="loading"]',
  '[data-testid*="spinner"]',
  '[data-testid*="skeleton"]',
  '.loading',
  '.spinner',
  '.skeleton',
  '.loading-indicator',
  '.loading-overlay',
  '[aria-busy="true"]',
];

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

// Simple logger for session debugging (all output to stderr to keep stdout clean for protocols)
const log = {
  info: (msg: string, ...args: unknown[]) => console.error(`[puppet:session] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[puppet:session] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.error(`[puppet:session:debug] ${msg}`, ...args);
  },
};

/** Default timeout for Playwright screenshot before falling back to CDP */
const CDP_SCREENSHOT_TIMEOUT = 5000;

/**
 * Take a screenshot that works reliably with CDP connections.
 *
 * Playwright's page.screenshot() hangs on Electron webview targets because
 * document.fonts.ready never resolves. This helper tries Playwright first
 * with a timeout, then falls back to the CDP Page.captureScreenshot command
 * which bypasses font waiting entirely.
 */
async function cdpSafeScreenshot(
  page: Page,
  options: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    path?: string;
  } = {}
): Promise<Buffer> {
  try {
    return await page.screenshot({
      fullPage: options.clip ? undefined : options.fullPage,
      clip: options.clip,
      path: options.path,
      timeout: CDP_SCREENSHOT_TIMEOUT,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Timeout') && !msg.includes('timeout')) {
      throw err; // Re-throw non-timeout errors
    }

    log.info('Playwright screenshot timed out (font loading), falling back to CDP capture');

    // Fall back to raw CDP screenshot
    let cdpSession: CDPSession | undefined;
    try {
      cdpSession = await page.context().newCDPSession(page);
      const captureParams: Record<string, unknown> = { format: 'png' };

      if (options.clip) {
        captureParams.clip = {
          x: options.clip.x,
          y: options.clip.y,
          width: options.clip.width,
          height: options.clip.height,
          scale: 1,
        };
      } else if (options.fullPage) {
        // Get full page dimensions
        const metrics = (await cdpSession.send('Page.getLayoutMetrics')) as {
          contentSize: { width: number; height: number };
        };
        captureParams.clip = {
          x: 0,
          y: 0,
          width: metrics.contentSize.width,
          height: metrics.contentSize.height,
          scale: 1,
        };
        captureParams.captureBeyondViewport = true;
      }

      const result = (await cdpSession.send('Page.captureScreenshot', captureParams)) as {
        data: string;
      };
      const buffer = Buffer.from(result.data, 'base64');

      if (options.path) {
        const { writeFile: writeFileAsync } = await import('fs/promises');
        await writeFileAsync(options.path, buffer);
      }

      return buffer;
    } finally {
      if (cdpSession) {
        try {
          await cdpSession.detach();
        } catch {
          // Ignore detach errors
        }
      }
    }
  }
}

/**
 * Take an element screenshot that works reliably with CDP connections.
 *
 * Falls back to CDP Page.captureScreenshot with a clip based on the
 * element's bounding box if Playwright's locator.screenshot() hangs.
 */
async function cdpSafeElementScreenshot(
  page: Page,
  frame: Frame | Page,
  selector: string
): Promise<Buffer> {
  const element = await frame.locator(selector).first();

  try {
    return await element.screenshot({ timeout: CDP_SCREENSHOT_TIMEOUT });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Timeout') && !msg.includes('timeout')) {
      throw err;
    }

    log.info('Playwright element screenshot timed out, falling back to CDP capture');

    // Get bounding box and use CDP clip
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Element has no bounding box: ${selector}`);
    }

    return cdpSafeScreenshot(page, {
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
  }
}

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

  // Launch browser (or connect via CDP)
  const isCDP = Boolean(options.cdp);
  log.info(isCDP ? `Connecting to browser via CDP: ${options.cdp}` : 'Launching browser...');
  const browserResult = await getBrowser({
    headless: options.headless ?? false,
    viewport: options.viewport,
    video: options.video,
    showCursor: options.showCursor,
    cdp: options.cdp,
    cdpPageUrl: options.cdpPageUrl,
  });
  let { browser, context, page, videoEnabled, cleanup: instanceCleanup } = browserResult;
  const { screenRecorder, directCDPSession } = browserResult;
  log.info(
    isCDP ? 'Connected via CDP' : 'Browser launched',
    videoEnabled ? '(video recording enabled)' : ''
  );

  let cursor = createCursor(page);
  let running = true;
  let browserConnected = true;
  let cleaningUp = false;

  // Track when the DirectCDPSession WS disconnects — closing the direct WS
  // to a page target can cause Electron to close the page, firing Playwright's
  // page.on('close') event. This flag prevents the tab close handler from
  // treating it as an unexpected close.
  let directCDPSessionClosed = false;
  if (directCDPSession) {
    directCDPSession.onClose(() => {
      directCDPSessionClosed = true;
      log.debug(
        'DirectCDPSession WS closed — subsequent tab close events will be treated as expected'
      );
    });
  }

  // Frame context for iframe support
  let currentFrame: Frame | typeof page = page;

  // Tab management
  const tabs = new Map<string, typeof page>();
  let tabCounter = 0;
  let activeTabId = String(++tabCounter);
  tabs.set(activeTabId, page);
  const intentionalCloses = new Set<string>();

  /** Set up event listeners for a tab page */
  function setupTabListeners(tabId: string, tabPage: typeof page) {
    tabPage.on('close', () => {
      if (intentionalCloses.has(tabId)) {
        intentionalCloses.delete(tabId);
        return; // Intentional close via closeTab command
      }
      // During cleanup (running=false), tab closes are expected — don't treat as errors
      if (!running) {
        tabs.delete(tabId);
        return;
      }
      // DirectCDPSession WS disconnect can cause Electron to close the page target.
      // The page is no longer usable, but this isn't an "unexpected" crash — treat
      // it like an intentional close to avoid crashing the session.
      if (directCDPSessionClosed) {
        log.info(`Tab ${tabId} closed after DirectCDPSession disconnect (expected)`);
        tabs.delete(tabId);
        return;
      }
      log.info(`Tab ${tabId} closed unexpectedly`);
      tabs.delete(tabId);
      if (tabs.size === 0) {
        log.error('All tabs closed unexpectedly');
        running = false;
        writeStatus();
      } else if (tabId === activeTabId) {
        // Switch to another tab
        const [newId, newPage] = Array.from(tabs.entries())[0];
        page = newPage;
        activeTabId = newId;
        currentFrame = page;
        cursor = createCursor(page);
      }
    });

    tabPage.on('dialog', async dialog => {
      lastDialogMessage = dialog.message();
      log.info(`Dialog (${dialog.type()}): "${lastDialogMessage}" - ${dialogAction}ing`);
      if (dialogAction === 'accept') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

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
      // During cleanup, browser disconnect is expected — don't treat as error
      if (!running || cleaningUp) {
        browserConnected = false;
        return;
      }
      log.error('Browser disconnected unexpectedly');
      browserConnected = false;
      running = false;
      writeStatus();
    });

    // Set up tab listeners for the initial page
    setupTabListeners(activeTabId, page);
  }

  attachEventListeners();
  let lastCommandId = '';
  let watcher: FSWatcher | null = null;

  // Process a command
  async function processCommand(cmd: Command): Promise<CommandResult> {
    const { id, action, params = {} } = cmd;
    log.info(`Processing command: ${action} (id: ${id})`);
    log.debug('Command params:', params);

    // Resolve testid shorthand to selector
    if (params.testid && !params.selector) {
      params.selector = `[data-testid="${params.testid}"]`;
      log.debug(`Resolved testid "${params.testid}" to selector "${params.selector}"`);
    }

    // Smart selector resolution - bare strings become testid selectors
    if (params.selector && typeof params.selector === 'string') {
      const originalSelector = params.selector;
      params.selector = resolveSelector(params.selector);
      if (params.selector !== originalSelector) {
        log.debug(`Resolved selector "${originalSelector}" to "${params.selector}"`);
      }
    }

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
      const retryOpts = params.retry as number | RetryOptions | undefined;

      switch (action) {
        case 'init':
        case 'noop':
          // No-op commands for session initialization
          break;

        case 'goto':
          await page.goto(params.url as string);
          // Reset frame context on navigation
          currentFrame = page;
          break;

        case 'click':
          await executeWithOptionalRetry(async () => {
            if (currentFrame === page) {
              await cursor.click(params.selector as string);
            } else {
              await currentFrame.click(params.selector as string);
            }
          }, retryOpts);
          break;

        case 'drag':
          await executeWithOptionalRetry(async () => {
            if (currentFrame === page) {
              await cursor.drag(params.sourceSelector as string, params.targetSelector as string);
            } else {
              await currentFrame.dragAndDrop(
                params.sourceSelector as string,
                params.targetSelector as string
              );
            }
          }, retryOpts);
          break;

        case 'dragCoordinates': {
          const sx = params.sourceX as number;
          const sy = params.sourceY as number;
          const tx = params.targetX as number;
          const ty = params.targetY as number;

          // Move to source with human-like motion
          await cursor.moveToCoords(sx, sy);
          await new Promise(r => setTimeout(r, 400 + Math.random() * 200));

          // Press mouse down (trusted CDP event)
          await page.mouse.down();
          await new Promise(r => setTimeout(r, 100 + Math.random() * 100));

          // Drag to target with human-like motion
          await cursor.moveToCoords(tx, ty);
          await new Promise(r => setTimeout(r, 200 + Math.random() * 200));

          // Release mouse (trusted CDP event)
          await page.mouse.up();
          break;
        }

        case 'clear':
          await currentFrame.locator(params.selector as string).clear();
          break;

        case 'type':
          await executeWithOptionalRetry(async () => {
            if (currentFrame === page) {
              await cursor.type(params.selector as string, params.text as string);
            } else {
              await currentFrame.fill(params.selector as string, params.text as string);
            }
          }, retryOpts);
          break;

        case 'scroll':
          await cursor.scroll(
            (params.direction as 'up' | 'down') ?? 'down',
            (params.amount as number) ?? 300
          );
          break;

        case 'screenshot': {
          let buffer: Buffer;
          if (params.selector) {
            // Element screenshot
            if (isCDP) {
              buffer = await cdpSafeElementScreenshot(
                page,
                currentFrame,
                params.selector as string
              );
            } else {
              const element = await currentFrame.locator(params.selector as string).first();
              buffer = await element.screenshot();
            }
          } else {
            // Viewport/region screenshot — clip takes precedence over fullPage
            const clip = params.clip as
              | { x: number; y: number; width: number; height: number }
              | undefined;
            if (isCDP) {
              buffer = await cdpSafeScreenshot(page, {
                fullPage: clip ? undefined : (params.fullPage as boolean),
                clip,
              });
            } else {
              buffer = await page.screenshot({
                fullPage: clip ? undefined : (params.fullPage as boolean),
                clip,
              });
            }
          }
          result = buffer.toString('base64');
          break;
        }

        case 'evaluate':
          result = await currentFrame.evaluate(params.script as string);
          break;

        case 'waitFor':
          await executeWithOptionalRetry(async () => {
            await currentFrame.waitForSelector(params.selector as string, {
              timeout: (params.timeout as number) ?? 5000,
            });
          }, retryOpts);
          break;

        case 'waitForLoaded': {
          const customSelectors = params.selectors as string[] | undefined;
          const selectorsToCheck = customSelectors ?? LOADING_SELECTORS;
          const timeout = (params.timeout as number) ?? 10000;
          const startTime = Date.now();

          // Wait for each loading selector to disappear
          for (const selector of selectorsToCheck) {
            if (Date.now() - startTime > timeout) break;

            try {
              const exists = await page.$(selector);
              if (exists) {
                await page.waitForSelector(selector, {
                  state: 'hidden',
                  timeout: Math.max(1000, timeout - (Date.now() - startTime)),
                });
              }
            } catch {
              // Selector doesn't exist or already hidden, continue
            }
          }

          // Also wait for network to be idle
          if (params.waitForNetwork !== false) {
            try {
              await page.waitForLoadState('networkidle', {
                timeout: Math.max(1000, timeout - (Date.now() - startTime)),
              });
            } catch {
              log.debug('Network did not reach idle state');
            }
          }

          result = { loaded: true };
          break;
        }

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

        case 'clearState': {
          const cleared: string[] = ['cookies'];

          // Clear cookies
          await context.clearCookies();

          // Clear storage (may fail on about:blank or file:// URLs)
          try {
            await page.evaluate(() => {
              localStorage.clear();
              sessionStorage.clear();
            });
            cleared.push('localStorage', 'sessionStorage');
          } catch {
            log.debug('Could not clear storage (may be on about:blank or restricted URL)');
          }

          // Optionally clear IndexedDB
          if (params.includeIndexedDB) {
            try {
              await page.evaluate(async () => {
                const databases = await indexedDB.databases();
                for (const db of databases) {
                  if (db.name) indexedDB.deleteDatabase(db.name);
                }
              });
              cleared.push('indexedDB');
            } catch {
              log.debug('Could not clear IndexedDB');
            }
          }

          result = { cleared };
          break;
        }

        case 'uploadFile': {
          const uploadSelector = params.selector as string;
          const filePath = params.filePath as string | string[];

          const fileInput = await page.$(uploadSelector);
          if (!fileInput) {
            throw new Error(`File input not found: ${uploadSelector}`);
          }

          const inputType = await fileInput.getAttribute('type');
          if (inputType !== 'file') {
            throw new Error(`Element is not a file input (type="${inputType}"): ${uploadSelector}`);
          }

          const files = Array.isArray(filePath) ? filePath : [filePath];
          await fileInput.setInputFiles(files);
          result = { uploaded: files };
          break;
        }

        case 'switchToFrame': {
          const frameSelector = params.selector as string;
          const frameElement = await page.$(frameSelector);
          if (!frameElement) {
            throw new Error(`iframe not found: ${frameSelector}`);
          }

          const frame = await frameElement.contentFrame();
          if (!frame) {
            throw new Error(
              `Could not access iframe content: ${frameSelector}. May be cross-origin restricted.`
            );
          }

          currentFrame = frame;
          result = { switched: true, url: frame.url() };
          break;
        }

        case 'switchToMain':
          currentFrame = page;
          result = { switched: true };
          break;

        case 'getFrames':
          result = page.frames().map(f => ({
            name: f.name(),
            url: f.url(),
          }));
          break;

        case 'assertVisible': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }
          const isVisible = await element.isVisible();
          if (!isVisible) {
            throw new Error(`Assertion failed: Element is not visible: ${selector}`);
          }
          result = { passed: true };
          break;
        }

        case 'assertHidden': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              throw new Error(
                `Assertion failed: Element is visible (expected hidden): ${selector}`
              );
            }
          }
          // Element not found or not visible = passes
          result = { passed: true };
          break;
        }

        case 'assertText': {
          const selector = params.selector as string;
          const expected = params.expected as string;
          const exact = params.exact !== false; // default true

          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const actual = (await element.textContent()) || '';
          const matches = exact ? actual.trim() === expected : actual.includes(expected);

          if (!matches) {
            throw new Error(
              `Assertion failed: Text mismatch\n` +
                `  Selector: ${selector}\n` +
                `  Expected: "${expected}"\n` +
                `  Actual: "${actual.trim()}"\n` +
                `  Mode: ${exact ? 'exact' : 'contains'}`
            );
          }
          result = { passed: true, actual: actual.trim() };
          break;
        }

        case 'assertValue': {
          const selector = params.selector as string;
          const expected = params.expected as string;

          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const actual = await element.inputValue();
          if (actual !== expected) {
            throw new Error(
              `Assertion failed: Value mismatch\n` +
                `  Selector: ${selector}\n` +
                `  Expected: "${expected}"\n` +
                `  Actual: "${actual}"`
            );
          }
          result = { passed: true, actual };
          break;
        }

        case 'assertChecked': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const isChecked = await element.isChecked();
          if (!isChecked) {
            throw new Error(`Assertion failed: Element is not checked: ${selector}`);
          }
          result = { passed: true };
          break;
        }

        case 'assertUnchecked': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const isChecked = await element.isChecked();
          if (isChecked) {
            throw new Error(
              `Assertion failed: Element is checked (expected unchecked): ${selector}`
            );
          }
          result = { passed: true };
          break;
        }

        case 'assertEnabled': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const isDisabled = await element.isDisabled();
          if (isDisabled) {
            throw new Error(
              `Assertion failed: Element is disabled (expected enabled): ${selector}`
            );
          }
          result = { passed: true };
          break;
        }

        case 'assertDisabled': {
          const selector = params.selector as string;
          const element = await currentFrame.$(selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found: ${selector}`);
          }

          const isDisabled = await element.isDisabled();
          if (!isDisabled) {
            throw new Error(
              `Assertion failed: Element is enabled (expected disabled): ${selector}`
            );
          }
          result = { passed: true };
          break;
        }

        case 'assertUrl': {
          const expected = params.expected as string;
          const exact = params.exact !== false; // default true
          const actual = page.url();

          const matches = exact ? actual === expected : actual.includes(expected);
          if (!matches) {
            throw new Error(
              `Assertion failed: URL mismatch\n` +
                `  Expected: "${expected}"\n` +
                `  Actual: "${actual}"\n` +
                `  Mode: ${exact ? 'exact' : 'contains'}`
            );
          }
          result = { passed: true, actual };
          break;
        }

        case 'assertTitle': {
          const expected = params.expected as string;
          const exact = params.exact !== false; // default true
          const actual = await page.title();

          const matches = exact ? actual === expected : actual.includes(expected);
          if (!matches) {
            throw new Error(
              `Assertion failed: Title mismatch\n` +
                `  Expected: "${expected}"\n` +
                `  Actual: "${actual}"\n` +
                `  Mode: ${exact ? 'exact' : 'contains'}`
            );
          }
          result = { passed: true, actual };
          break;
        }

        case 'assertCount': {
          const selector = params.selector as string;
          const expected = params.count as number;
          const elements = await currentFrame.$$(selector);
          const actual = elements.length;

          if (actual !== expected) {
            throw new Error(
              `Assertion failed: Element count mismatch\n` +
                `  Selector: ${selector}\n` +
                `  Expected: ${expected}\n` +
                `  Actual: ${actual}`
            );
          }
          result = { passed: true, count: actual };
          break;
        }

        case 'newTab': {
          const newPage = await context.newPage();
          const tabId = String(++tabCounter);
          tabs.set(tabId, newPage);
          setupTabListeners(tabId, newPage);

          // Switch to new tab
          page = newPage;
          activeTabId = tabId;
          currentFrame = page;
          cursor = createCursor(page);

          // Navigate if URL provided
          if (params.url) {
            await page.goto(params.url as string);
          }

          result = { tabId };
          break;
        }

        case 'switchTab': {
          const tabId = params.tabId as string;
          const targetPage = tabs.get(tabId);
          if (!targetPage) {
            throw new Error(
              `Tab ${tabId} not found. Open tabs: ${Array.from(tabs.keys()).join(', ')}`
            );
          }
          page = targetPage;
          activeTabId = tabId;
          currentFrame = page;
          cursor = createCursor(page);
          await page.bringToFront();
          result = { tabId, url: page.url() };
          break;
        }

        case 'closeTab': {
          const tabId = (params.tabId as string) || activeTabId;
          const targetPage = tabs.get(tabId);
          if (!targetPage) {
            throw new Error(`Tab ${tabId} not found`);
          }
          if (tabs.size === 1) {
            throw new Error('Cannot close the last tab');
          }

          intentionalCloses.add(tabId);
          await targetPage.close();
          tabs.delete(tabId);

          // If we closed the active tab, switch to another
          if (tabId === activeTabId) {
            const remaining = Array.from(tabs.entries());
            const [newActiveId, newActivePage] = remaining[remaining.length - 1];
            page = newActivePage;
            activeTabId = newActiveId;
            currentFrame = page;
            cursor = createCursor(page);
            await page.bringToFront();
          }

          result = { closed: tabId, activeTab: activeTabId };
          break;
        }

        case 'listTabs': {
          const tabList = [];
          for (const [tabId, tabPage] of tabs) {
            tabList.push({
              id: tabId,
              url: tabPage.url(),
              title: await tabPage.title(),
              active: tabId === activeTabId,
            });
          }
          result = tabList;
          break;
        }

        case 'getVideoPath': {
          if (!videoEnabled) {
            result = { enabled: false, path: null };
          } else if (screenRecorder) {
            // CDP screencast recording — path is known upfront
            result = { enabled: true, path: screenRecorder.outputPath };
          } else {
            // Playwright native recording — path available after context close
            const video = page.video();
            if (video) {
              try {
                const videoPath = await video.path();
                result = { enabled: true, path: videoPath };
              } catch {
                result = {
                  enabled: true,
                  path: null,
                  note: 'Video not yet saved (call close first)',
                };
              }
            } else {
              result = { enabled: true, path: null };
            }
          }
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      log.info(`Command ${action} completed successfully`);
      return { id, success: true, result };
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Command ${action} failed:`, errorMsg);

      // Enhance error message for element-not-found errors
      if (err instanceof Error && isElementNotFoundError(err) && params.selector) {
        try {
          const context = await getElementErrorContext(page, params.selector as string);
          errorMsg = formatElementError(context);
        } catch {
          // Keep original error if context gathering fails
        }
      }

      // Capture screenshot on failure
      let screenshotPath: string | undefined;
      if (browserConnected && action !== 'screenshot') {
        try {
          const timestamp = Date.now();
          screenshotPath = `${FAILURE_SCREENSHOT_DIR}/error-${timestamp}.png`;
          await mkdir(FAILURE_SCREENSHOT_DIR, { recursive: true });
          if (isCDP) {
            await cdpSafeScreenshot(page, { path: screenshotPath, fullPage: true });
          } else {
            await page.screenshot({ path: screenshotPath, fullPage: true });
          }
          log.info(`Failure screenshot saved: ${screenshotPath}`);
        } catch (screenshotErr) {
          log.debug('Failed to capture failure screenshot:', screenshotErr);
        }
      }

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
        screenshotPath,
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

      // Handle close command — cleanup before writing result so video is finalized
      if (cmd.action === 'close') {
        log.info('Close command received, shutting down');
        await cleanup();
      }

      await writeFile(resultFile, JSON.stringify(result, null, 2));
      log.debug('Result written to:', resultFile);
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

  // Track last video path for retrieval after close
  let lastVideoPath: string | null = null;

  // Cleanup function
  async function cleanup() {
    log.info('Cleaning up session...');
    cleaningUp = true;
    running = false;
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    // Only try to close browser if it's still connected
    if (browserConnected) {
      try {
        // Mark all tabs as intentionally closing FIRST so any close events
        // during screencast stop or browser close don't fire errors
        for (const tabId of tabs.keys()) {
          intentionalCloses.add(tabId);
        }
        // Stop CDP screencast recorder if active
        if (screenRecorder) {
          try {
            lastVideoPath = await screenRecorder.stop();
            log.info('CDP video saved:', lastVideoPath);
          } catch (err) {
            log.debug('Could not stop screencast recorder:', err);
          }
        }
        // Detach DirectCDPSession WS after screencast is stopped and tabs are marked intentional
        if (directCDPSession && !directCDPSession.isClosed()) {
          try {
            await directCDPSession.detach();
          } catch {
            // May already be closed
          }
        }
        // If Playwright video recording was enabled, save the video path before closing
        if (videoEnabled && !screenRecorder) {
          const video = page.video();
          if (video) {
            try {
              // Close context first to finalize video
              await context.close();
              lastVideoPath = await video.path();
              log.info('Video saved:', lastVideoPath);
            } catch (err) {
              log.debug('Could not save video path:', err);
            }
          }
        }
        await browser.close();
        log.info('Browser closed');
      } catch (err) {
        log.debug('Browser already closed or errored during close:', err);
      }
    }
    // Clean up CDP proxy if active
    if (instanceCleanup) {
      instanceCleanup();
      instanceCleanup = undefined;
    }
    browserConnected = false;
    await writeStatus(); // Update status file
  }

  // Initialize lastCommandId from existing file to avoid processing stale commands
  try {
    const existingContent = await readFile(commandFile, 'utf-8');
    const existingCmd = JSON.parse(existingContent) as Command;
    if (existingCmd.id) {
      lastCommandId = existingCmd.id;
      log.debug('Initialized lastCommandId from existing file:', lastCommandId);
    }
  } catch {
    // Ignore - file may not exist or be empty
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

    async command(cmd: Omit<Command, 'id'>) {
      const id = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return processCommand({ ...cmd, id } as Command);
    },

    async restart() {
      log.info('Restarting session...');

      // Clean up existing session
      await cleanup();

      // Launch new browser (or reconnect via CDP)
      log.info(isCDP ? 'Reconnecting via CDP...' : 'Launching new browser...');
      const newInstance = await getBrowser({
        headless: options.headless ?? false,
        viewport: options.viewport,
        video: isCDP ? undefined : options.video,
        showCursor: options.showCursor,
        cdp: options.cdp,
        cdpPageUrl: options.cdpPageUrl,
      });
      browser = newInstance.browser;
      context = newInstance.context;
      page = newInstance.page;
      videoEnabled = newInstance.videoEnabled;
      instanceCleanup = newInstance.cleanup;
      cursor = createCursor(page);

      // Reset state
      browserConnected = true;
      running = true;
      lastCommandId = '';
      dialogAction = 'accept';
      lastDialogMessage = '';
      currentFrame = page;

      // Reset tab state
      tabs.clear();
      tabCounter = 0;
      activeTabId = String(++tabCounter);
      tabs.set(activeTabId, page);
      intentionalCloses.clear();

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
