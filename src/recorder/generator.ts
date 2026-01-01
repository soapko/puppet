/**
 * Code generator for recorded browser events
 *
 * Converts recorded events into executable test code.
 */

export interface RecordedEvent {
  type: 'goto' | 'click' | 'type' | 'select' | 'check' | 'uncheck' | 'scroll';
  selector: string;
  value?: string;
  timestamp: number;
}

export interface GeneratorOptions {
  /** Test name for the generated test */
  testName?: string;
  /** Whether to include timestamps as comments */
  includeTimestamps?: boolean;
  /** Output format */
  format?: 'puppet' | 'playwright';
}

/**
 * Simplify a selector for readability
 *
 * Converts [data-testid="x"] to just "x" when possible
 */
export function simplifySelector(selector: string): string {
  // Extract testid from [data-testid="x"] format
  const testidMatch = selector.match(/^\[data-testid="([^"]+)"\]$/);
  if (testidMatch) {
    return testidMatch[1];
  }

  // Return as-is for other selectors
  return selector;
}

/**
 * Escape a string for use in JavaScript code
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Deduplicate consecutive type events on the same selector
 *
 * When a user types into an input, we get many "type" events.
 * We only want the final value.
 */
export function deduplicateEvents(events: RecordedEvent[]): RecordedEvent[] {
  const result: RecordedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // For type events, look ahead to find the last consecutive type on same selector
    if (event.type === 'type') {
      let lastTypeIndex = i;
      for (let j = i + 1; j < events.length; j++) {
        const nextEvent = events[j];
        if (nextEvent.type === 'type' && nextEvent.selector === event.selector) {
          lastTypeIndex = j;
        } else {
          break;
        }
      }

      // Use the last type event (has final value)
      result.push(events[lastTypeIndex]);
      i = lastTypeIndex; // Skip the deduplicated events
    } else {
      result.push(event);
    }
  }

  return result;
}

/**
 * Generate test code from recorded events
 */
export function generateTestCode(events: RecordedEvent[], options: GeneratorOptions = {}): string {
  const { testName = 'recorded test', includeTimestamps = false, format = 'puppet' } = options;

  // Deduplicate type events
  const dedupedEvents = deduplicateEvents(events);

  if (format === 'playwright') {
    return generatePlaywrightCode(dedupedEvents, testName, includeTimestamps);
  }

  return generatePuppetCode(dedupedEvents, testName, includeTimestamps);
}

/**
 * Generate puppet test code
 */
function generatePuppetCode(
  events: RecordedEvent[],
  testName: string,
  includeTimestamps: boolean
): string {
  const lines: string[] = [
    "import { test } from 'puppet/test';",
    '',
    `test('${escapeString(testName)}', async ({ page }) => {`,
  ];

  for (const event of events) {
    const selector = simplifySelector(event.selector);
    const timestamp = includeTimestamps ? ` // ${new Date(event.timestamp).toISOString()}` : '';

    switch (event.type) {
      case 'goto':
        lines.push(`  await page.goto('${escapeString(event.value || '')}');${timestamp}`);
        break;

      case 'click':
        lines.push(`  await page.click('${escapeString(selector)}');${timestamp}`);
        break;

      case 'type':
        lines.push(
          `  await page.type('${escapeString(selector)}', '${escapeString(event.value || '')}');${timestamp}`
        );
        break;

      case 'select':
        lines.push(
          `  await page.select('${escapeString(selector)}', '${escapeString(event.value || '')}');${timestamp}`
        );
        break;

      case 'check':
        lines.push(`  await page.check('${escapeString(selector)}');${timestamp}`);
        break;

      case 'uncheck':
        lines.push(`  await page.uncheck('${escapeString(selector)}');${timestamp}`);
        break;

      case 'scroll':
        lines.push(`  await page.scroll('${event.value || 'down'}');${timestamp}`);
        break;
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate Playwright test code (for compatibility)
 */
function generatePlaywrightCode(
  events: RecordedEvent[],
  testName: string,
  includeTimestamps: boolean
): string {
  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    '',
    `test('${escapeString(testName)}', async ({ page }) => {`,
  ];

  for (const event of events) {
    const selector = event.selector; // Keep full selector for Playwright
    const timestamp = includeTimestamps ? ` // ${new Date(event.timestamp).toISOString()}` : '';

    switch (event.type) {
      case 'goto':
        lines.push(`  await page.goto('${escapeString(event.value || '')}');${timestamp}`);
        break;

      case 'click':
        lines.push(`  await page.click('${escapeString(selector)}');${timestamp}`);
        break;

      case 'type':
        lines.push(
          `  await page.fill('${escapeString(selector)}', '${escapeString(event.value || '')}');${timestamp}`
        );
        break;

      case 'select':
        lines.push(
          `  await page.selectOption('${escapeString(selector)}', '${escapeString(event.value || '')}');${timestamp}`
        );
        break;

      case 'check':
        lines.push(`  await page.check('${escapeString(selector)}');${timestamp}`);
        break;

      case 'uncheck':
        lines.push(`  await page.uncheck('${escapeString(selector)}');${timestamp}`);
        break;

      case 'scroll':
        lines.push(
          `  await page.evaluate(() => window.scrollBy(0, ${event.value === 'up' ? -300 : 300}));${timestamp}`
        );
        break;
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}
