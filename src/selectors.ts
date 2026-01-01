/**
 * Selector utilities for puppet
 */

/**
 * Create a data-testid selector from a bare ID
 * @param id - The testid value
 * @returns CSS selector string like [data-testid="id"]
 */
export function testid(id: string): string {
  return `[data-testid="${id}"]`;
}

/**
 * Resolve a selector, treating bare strings as testids
 * CSS selectors (starting with ., #, [) are passed through unchanged
 * @param selector - Selector string or bare testid
 * @returns Resolved CSS selector
 */
export function resolveSelector(selector: string): string {
  // Already a CSS selector - pass through
  if (selector.match(/^[.#[]/)) {
    return selector;
  }
  // Bare string - treat as testid
  return testid(selector);
}
