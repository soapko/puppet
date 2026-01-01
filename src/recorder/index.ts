/**
 * Recording mode - captures user interactions and generates test scripts
 */

import { writeFile } from 'fs/promises';

import { chromium } from 'playwright';

import { generateTestCode, type RecordedEvent, type GeneratorOptions } from './generator.js';
import { getInjectedScript } from './injected.js';

export interface RecordOptions {
  /** Initial URL to navigate to */
  url?: string;
  /** Output file path for generated test */
  output?: string;
  /** Test name for generated code */
  testName?: string;
  /** Output format */
  format?: 'puppet' | 'playwright';
  /** Whether to include timestamps in generated code */
  includeTimestamps?: boolean;
  /** Viewport size */
  viewport?: { width: number; height: number };
}

/**
 * Start recording user interactions
 *
 * Opens a browser, injects the recorder script, and captures user interactions.
 * When the user closes the browser or presses Ctrl+C, generates test code.
 */
export async function startRecording(options: RecordOptions = {}): Promise<string> {
  const {
    url,
    output,
    testName = 'recorded test',
    format = 'puppet',
    includeTimestamps = false,
    viewport = { width: 1920, height: 1080 },
  } = options;

  console.log('Starting recorder...');

  // Launch visible browser
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });

  const context = await browser.newContext({
    viewport,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Collected events
  const events: RecordedEvent[] = [];

  // Inject recorder script on every page load
  await context.addInitScript(getInjectedScript());

  // Expose callback function to receive events from the page
  await context.exposeFunction('__puppetRecorderCallback', (event: RecordedEvent) => {
    events.push(event);
    console.log(`Recorded: ${event.type} on ${event.selector}`);
  });

  // Navigate to start URL if provided
  if (url) {
    console.log(`Navigating to ${url}...`);
    await page.goto(url);
    events.push({
      type: 'goto',
      selector: '',
      value: url,
      timestamp: Date.now(),
    });
  }

  console.log('\nRecording... Perform actions in the browser.');
  console.log('Press Ctrl+C or close the browser when done.\n');

  // Wait for browser/page close or SIGINT
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;

    console.log('\nStopping recorder...');

    // Generate code
    const generatorOptions: GeneratorOptions = {
      testName,
      format,
      includeTimestamps,
    };

    const code = generateTestCode(events, generatorOptions);

    console.log('\n--- Generated Test ---\n');
    console.log(code);

    // Save to file if output specified
    if (output) {
      await writeFile(output, code, 'utf-8');
      console.log(`\nSaved to ${output}`);
    }

    // Close browser
    try {
      await browser.close();
    } catch {
      // Browser may already be closed
    }

    return code;
  };

  // Handle graceful shutdown
  let generatedCode = '';

  await new Promise<void>(resolve => {
    // Handle browser close
    browser.on('disconnected', async () => {
      generatedCode = (await cleanup()) || '';
      resolve();
    });

    // Handle page close
    page.on('close', async () => {
      generatedCode = (await cleanup()) || '';
      resolve();
    });

    // Handle Ctrl+C
    const sigintHandler = async () => {
      process.removeListener('SIGINT', sigintHandler);
      generatedCode = (await cleanup()) || '';
      resolve();
    };
    process.on('SIGINT', sigintHandler);
  });

  return generatedCode;
}

// Re-export types and utilities
export { generateTestCode, simplifySelector, deduplicateEvents } from './generator.js';
export type { RecordedEvent, GeneratorOptions } from './generator.js';
export { getInjectedScript } from './injected.js';
