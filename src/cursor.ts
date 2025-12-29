import type { Page } from 'playwright';
import {
  createCursor as createGhostCursor,
  type Cursor as GhostCursor,
} from 'ghost-cursor-playwright';
import type { CursorOptions } from './types.js';

/**
 * Human-like cursor wrapper using ghost-cursor-playwright
 * Simulates realistic mouse movements using Bezier curves
 */
export class Cursor {
  private ghostCursor: GhostCursor | null = null;
  private page: Page;
  private options: Required<CursorOptions>;
  private initPromise: Promise<void> | null = null;

  constructor(page: Page, options: CursorOptions = {}) {
    this.page = page;
    this.options = {
      moveSpeed: options.moveSpeed ?? 1,
      hesitation: options.hesitation ?? true,
      overshootSpread: options.overshootSpread ?? 10,
    };
  }

  /**
   * Initialize the cursor (lazy initialization)
   */
  private async init(): Promise<GhostCursor> {
    if (this.ghostCursor) return this.ghostCursor;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.ghostCursor = await createGhostCursor(this.page, {
          overshootSpread: this.options.overshootSpread,
        });
      })();
    }

    await this.initPromise;
    return this.ghostCursor!;
  }

  /**
   * Move to element with human-like motion
   */
  async moveTo(selector: string): Promise<void> {
    const cursor = await this.init();
    if (this.options.hesitation) {
      await this.randomDelay(20, 60);
    }
    await cursor.actions.move(selector, {
      paddingPercentage: 10, // Don't always hit center
    });
  }

  /**
   * Move to specific coordinates with human-like motion
   */
  async moveToCoords(x: number, y: number): Promise<void> {
    const cursor = await this.init();
    if (this.options.hesitation) {
      await this.randomDelay(20, 60);
    }
    await cursor.actions.move({ x, y });
  }

  /**
   * Click element with human-like approach
   * Moves to element with Bezier curves, then clicks
   */
  async click(selector: string): Promise<void> {
    await this.moveTo(selector);
    if (this.options.hesitation) {
      await this.randomDelay(20, 50);
    }
    await this.page.click(selector);
  }

  /**
   * Double-click element with human-like approach
   */
  async doubleClick(selector: string): Promise<void> {
    await this.moveTo(selector);
    if (this.options.hesitation) {
      await this.randomDelay(20, 50);
    }
    await this.page.dblclick(selector);
  }

  /**
   * Type text with human-like delays between keystrokes
   */
  async type(selector: string, text: string): Promise<void> {
    await this.click(selector);
    await this.randomDelay(30, 60);

    for (const char of text) {
      await this.page.keyboard.type(char);
      await this.randomDelay(20, 60); // Variable typing speed
    }
  }

  /**
   * Scroll in a direction with human-like chunked behavior
   */
  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    const scrollAmount = direction === 'down' ? amount : -amount;

    // Humans scroll in chunks, not all at once
    const chunks = Math.ceil(Math.abs(amount) / 100);
    const chunkSize = scrollAmount / chunks;

    for (let i = 0; i < chunks; i++) {
      await this.page.mouse.wheel(0, chunkSize);
      await this.randomDelay(20, 50);
    }
  }

  /**
   * Scroll an element into view, then optionally scroll within it
   */
  async scrollTo(selector: string): Promise<void> {
    const element = await this.page.$(selector);
    if (element) {
      await element.scrollIntoViewIfNeeded();
      await this.randomDelay(30, 80);
    }
  }

  /**
   * Simulate idle behavior (random micro-movements)
   * Useful for appearing more human on pages that detect mouse movement
   */
  async idle(duration: number = 2000): Promise<void> {
    const cursor = await this.init();
    const endTime = Date.now() + duration;

    while (Date.now() < endTime) {
      // Random movement within viewport
      await cursor.actions.randomMove(50);
      await this.randomDelay(200, 500);
    }
  }

  /**
   * Wait with a human-like random delay
   */
  async wait(minMs: number = 500, maxMs: number = 1500): Promise<void> {
    await this.randomDelay(minMs, maxMs);
  }

  /**
   * Random delay helper
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay * this.options.moveSpeed));
  }
}

/**
 * Create a human-like cursor for a page
 *
 * @example
 * ```typescript
 * const cursor = createCursor(page);
 * await cursor.click('button.submit');
 * await cursor.type('input[name="email"]', 'user@example.com');
 * ```
 */
export function createCursor(page: Page, options?: CursorOptions): Cursor {
  return new Cursor(page, options);
}
