import {
  createCursor as createGhostCursor,
  type Cursor as GhostCursor,
} from 'ghost-cursor-playwright';
import type { Page } from 'playwright';

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
  private lastX: number = 0;
  private lastY: number = 0;

  constructor(page: Page, options: CursorOptions = {}) {
    this.page = page;
    this.options = {
      moveSpeed: options.moveSpeed ?? 1,
      hesitation: options.hesitation ?? true,
      overshootSpread: options.overshootSpread ?? 10,
    };
  }

  /**
   * Update the visual cursor position in the page (for video recording)
   */
  private async updateVisualCursor(x: number, y: number): Promise<void> {
    this.lastX = x;
    this.lastY = y;
    try {
      await this.page.evaluate(
        ([px, py]) => {
          if (
            typeof (window as unknown as { __puppetMoveCursor__?: (x: number, y: number) => void })
              .__puppetMoveCursor__ === 'function'
          ) {
            (
              window as unknown as { __puppetMoveCursor__: (x: number, y: number) => void }
            ).__puppetMoveCursor__(px, py);
          }
        },
        [x, y]
      );
    } catch {
      // Ignore errors (page might be navigating)
    }
  }

  /**
   * Trigger visual click effect (for video recording)
   */
  private async triggerVisualClick(x: number, y: number): Promise<void> {
    try {
      await this.page.evaluate(
        ([px, py]) => {
          if (
            typeof (window as unknown as { __puppetClickEffect__?: (x: number, y: number) => void })
              .__puppetClickEffect__ === 'function'
          ) {
            (
              window as unknown as { __puppetClickEffect__: (x: number, y: number) => void }
            ).__puppetClickEffect__(px, py);
          }
        },
        [x, y]
      );
    } catch {
      // Ignore errors
    }
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
          debug: false, // Disable ghost-cursor's visual indicator
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

    // Get target position first
    const box = await this.page.locator(selector).boundingBox();
    if (!box) {
      await cursor.actions.move(selector, { paddingPercentage: 10 });
      return;
    }

    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;

    // Animate visual cursor to target while ghost-cursor moves
    const movePromise = cursor.actions.move(selector, { paddingPercentage: 10 });
    await this.animateVisualCursor(targetX, targetY, 200);
    await movePromise;

    // Ensure final position is exact
    await this.updateVisualCursor(targetX, targetY);
  }

  /**
   * Move to specific coordinates with human-like motion
   */
  async moveToCoords(x: number, y: number): Promise<void> {
    const cursor = await this.init();
    if (this.options.hesitation) {
      await this.randomDelay(20, 60);
    }

    // Animate visual cursor to target while ghost-cursor moves
    const movePromise = cursor.actions.move({ x, y });
    await this.animateVisualCursor(x, y, 200);
    await movePromise;

    // Ensure final position is exact
    await this.updateVisualCursor(x, y);
  }

  /**
   * Animate visual cursor to target position over duration
   */
  private async animateVisualCursor(
    targetX: number,
    targetY: number,
    durationMs: number
  ): Promise<void> {
    const steps = 10;
    const stepDuration = durationMs / steps;
    const startX = this.lastX;
    const startY = this.lastY;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Ease-out curve for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 2);
      const currentX = startX + (targetX - startX) * eased;
      const currentY = startY + (targetY - startY) * eased;
      await this.updateVisualCursor(currentX, currentY);
      await new Promise(r => setTimeout(r, stepDuration));
    }
  }

  /**
   * Check if element is covered by another element
   * Returns the covering element's identifier if covered, null if clear
   */
  private async checkIfCovered(selector: string): Promise<string | null> {
    return await this.page.evaluate(sel => {
      const target = document.querySelector(sel);
      if (!target) return null;

      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const topElement = document.elementFromPoint(centerX, centerY);
      if (!topElement) return null;

      // Check if the top element is the target or a child of the target
      if (target.contains(topElement) || target === topElement) {
        return null; // Not covered
      }

      // Return identifier for the covering element
      return (
        topElement.getAttribute('data-testid') ||
        (topElement.id ? `#${topElement.id}` : null) ||
        topElement.tagName.toLowerCase()
      );
    }, selector);
  }

  /**
   * Click element with human-like approach
   * Moves to element with Bezier curves, then clicks
   * Includes covered element detection
   */
  async click(selector: string): Promise<void> {
    // Wait for element to be attached to DOM
    await this.page.waitForSelector(selector, { state: 'attached', timeout: 5000 });

    // Check if covered by another element
    const coveredBy = await this.checkIfCovered(selector);
    if (coveredBy) {
      throw new Error(
        `Element "${selector}" is covered by "${coveredBy}". ` +
          `Dismiss the covering element first.`
      );
    }

    await this.moveTo(selector);
    if (this.options.hesitation) {
      await this.randomDelay(20, 50);
    }

    // Trigger visual click effect
    await this.triggerVisualClick(this.lastX, this.lastY);

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
    await new Promise(resolve => setTimeout(resolve, delay * this.options.moveSpeed));
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
