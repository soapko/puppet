import type { Page } from 'playwright';

import type { CursorOptions } from './types.js';

/**
 * Generate a point on a quadratic Bezier curve
 */
function bezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Generate a control point for natural curve (perpendicular offset)
 */
function generateControlPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  spread: number
): { x: number; y: number } {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Perpendicular direction
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: midX, y: midY };

  // Perpendicular unit vector
  const perpX = -dy / length;
  const perpY = dx / length;

  // Random offset along perpendicular, scaled by distance
  const offset = (Math.random() - 0.5) * 2 * Math.min(spread, length * 0.3);

  return {
    x: midX + perpX * offset,
    y: midY + perpY * offset,
  };
}

/**
 * Human-like cursor with smooth Bezier movement
 * No teleporting - all movements are physically possible
 */
export class Cursor {
  private page: Page;
  private options: Required<CursorOptions>;
  private lastX: number = 100;
  private lastY: number = 100;
  private initialized: boolean = false;

  constructor(page: Page, options: CursorOptions = {}) {
    this.page = page;
    this.options = {
      moveSpeed: options.moveSpeed ?? 1,
      hesitation: options.hesitation ?? true,
      overshootSpread: options.overshootSpread ?? 50,
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
   * Initialize the cursor position (move to starting position)
   */
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    // Move actual mouse to initial position
    await this.page.mouse.move(this.lastX, this.lastY);
  }

  // Maximum cursor velocity in pixels per millisecond (2000 px/sec)
  private readonly MAX_VELOCITY = 2.0;

  /**
   * Smoothly move along a Bezier curve with human-like imperfections
   * Respects maximum velocity - faster movements increase overshoot/undershoot
   */
  private async smoothMove(targetX: number, targetY: number): Promise<void> {
    await this.init();

    const start = { x: this.lastX, y: this.lastY };
    const end = { x: targetX, y: targetY };
    const control = generateControlPoint(start, end, this.options.overshootSpread);

    // Calculate distance
    const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    if (distance < 1) {
      // Already at target
      return;
    }

    // Desired duration based on Fitts' Law (faster for short distances)
    const desiredDuration = (150 + Math.min(350, distance * 0.5)) / this.options.moveSpeed;

    // Calculate velocity and cap at maximum
    const desiredVelocity = distance / desiredDuration;
    const cappedVelocity = Math.min(desiredVelocity, this.MAX_VELOCITY);
    const actualDuration = distance / cappedVelocity;

    // How close to max velocity are we? (0 = slow, 1 = at max)
    const velocityRatio = cappedVelocity / this.MAX_VELOCITY;

    // More steps for longer distances and smoother movement
    const steps = Math.max(15, Math.ceil(distance / 8));
    const baseStepDelay = actualDuration / steps;

    // Overshoot/undershoot probability increases dramatically with velocity
    // At slow speed: 10% chance, at max speed: 60% chance
    const missChance = 0.1 + velocityRatio * 0.5;
    const willMiss = Math.random() < missChance;

    // Miss magnitude also scales with velocity (faster = bigger miss)
    const baseMissDistance = 3 + velocityRatio * 12; // 3-15 pixels

    // Move along Bezier curve with human imperfections
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Ease-in-out for natural acceleration/deceleration
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const point = bezierPoint(eased, start, control, end);

      // Jitter scales with velocity (faster = shakier)
      const jitterBase = Math.max(0.5, 2 - t * 2);
      const jitterAmount = jitterBase * (0.5 + velocityRatio * 0.5);
      const jitterX = (Math.random() - 0.5) * jitterAmount;
      const jitterY = (Math.random() - 0.5) * jitterAmount;

      const finalX = point.x + jitterX;
      const finalY = point.y + jitterY;

      // Move real mouse
      await this.page.mouse.move(finalX, finalY, { steps: 1 });

      // Update visual cursor
      await this.updateVisualCursor(finalX, finalY);

      // Variable delay (humans don't move at constant speed)
      const delayVariation = 0.7 + Math.random() * 0.6;
      await new Promise(r => setTimeout(r, baseStepDelay * delayVariation));

      // Occasional micro-pause mid-movement (less likely when moving fast)
      const pauseChance = 0.05 * (1 - velocityRatio * 0.8);
      if (t > 0.3 && t < 0.7 && Math.random() < pauseChance) {
        await new Promise(r => setTimeout(r, 30 + Math.random() * 50));
      }
    }

    // Overshoot or undershoot based on velocity
    if (willMiss) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const missDistance = baseMissDistance * (0.5 + Math.random());

      // 60% overshoot, 40% undershoot
      const isOvershoot = Math.random() < 0.6;
      const missMultiplier = isOvershoot ? 1 : -1;

      const missX = end.x + Math.cos(angle) * missDistance * missMultiplier;
      const missY = end.y + Math.sin(angle) * missDistance * missMultiplier;

      await this.page.mouse.move(missX, missY, { steps: 2 });
      await this.updateVisualCursor(missX, missY);

      // Pause to "realize" the miss (longer pause for bigger misses)
      await new Promise(r => setTimeout(r, 40 + missDistance * 3 + Math.random() * 30));

      // Correct back to target (slower, more careful)
      const correctionSteps = Math.ceil(missDistance / 3);
      for (let i = 1; i <= correctionSteps; i++) {
        const t = i / correctionSteps;
        const corrX = missX + (targetX - missX) * t;
        const corrY = missY + (targetY - missY) * t;
        await this.page.mouse.move(corrX, corrY, { steps: 1 });
        await this.updateVisualCursor(corrX, corrY);
        await new Promise(r => setTimeout(r, 15 + Math.random() * 10));
      }
    }

    // Ensure we end exactly at target
    this.lastX = targetX;
    this.lastY = targetY;
  }

  /**
   * Move to element with human-like motion
   */
  async moveTo(selector: string): Promise<void> {
    if (this.options.hesitation) {
      await this.randomDelay(20, 60);
    }

    // Get target position
    const box = await this.page.locator(selector).boundingBox();
    if (!box) {
      throw new Error(`Element not found or not visible: ${selector}`);
    }

    // Random point within element (not always center)
    const paddingX = box.width * 0.1;
    const paddingY = box.height * 0.1;
    const targetX = box.x + paddingX + Math.random() * (box.width - 2 * paddingX);
    const targetY = box.y + paddingY + Math.random() * (box.height - 2 * paddingY);

    await this.smoothMove(targetX, targetY);
  }

  /**
   * Move to specific coordinates with human-like motion
   */
  async moveToCoords(x: number, y: number): Promise<void> {
    if (this.options.hesitation) {
      await this.randomDelay(20, 60);
    }
    await this.smoothMove(x, y);
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
   * Moves to element with Bezier curves, pauses, then clicks
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

    // Pause on target before clicking (~500ms) so viewer can register the click target
    await this.randomDelay(400, 600);

    // Trigger visual click effect
    await this.triggerVisualClick(this.lastX, this.lastY);

    // Click at current mouse position (don't use page.click which moves mouse again)
    await this.page.mouse.click(this.lastX, this.lastY);
  }

  /**
   * Double-click element with human-like approach
   */
  async doubleClick(selector: string): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'attached', timeout: 5000 });
    await this.moveTo(selector);

    // Pause on target before clicking (~500ms)
    await this.randomDelay(400, 600);

    await this.triggerVisualClick(this.lastX, this.lastY);
    await this.page.mouse.dblclick(this.lastX, this.lastY);
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
    const endTime = Date.now() + duration;

    while (Date.now() < endTime) {
      // Small random movement from current position
      const offsetX = (Math.random() - 0.5) * 20;
      const offsetY = (Math.random() - 0.5) * 20;
      await this.smoothMove(this.lastX + offsetX, this.lastY + offsetY);
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
