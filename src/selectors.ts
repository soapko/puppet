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
 * Common HTML tag names that should be preserved as-is
 */
const HTML_TAGS =
  /^(div|span|p|a|button|input|form|table|tr|td|th|thead|tbody|tfoot|ul|ol|li|img|h[1-6]|nav|header|footer|main|section|article|aside|label|select|option|textarea|fieldset|legend|details|summary|dialog|canvas|svg|video|audio|source|iframe|embed|object|param|picture|figure|figcaption|blockquote|pre|code|hr|br|b|i|u|s|em|strong|small|sub|sup|mark|del|ins|abbr|cite|dfn|kbd|samp|var|time|address|dl|dt|dd)$/i;

/**
 * Resolve a selector, treating bare identifiers as testids
 * CSS selectors are passed through unchanged
 *
 * Resolution rules:
 * - Starts with CSS selector chars (., #, [, >, +, ~, :) → use as-is
 * - Contains combinators or spaces → use as-is (complex selector)
 * - Matches common HTML tag name → use as-is
 * - Bare alphanumeric identifier → convert to [data-testid="..."]
 *
 * @param selector - Selector string or bare testid
 * @returns Resolved CSS selector
 */
export function resolveSelector(selector: string): string {
  // Starts with CSS selector chars - use as-is
  if (/^[.#[>+~:]/.test(selector)) {
    return selector;
  }

  // Contains combinators or spaces - use as-is (complex selector)
  if (/[\s>+~]/.test(selector)) {
    return selector;
  }

  // Common HTML tags - use as-is
  if (HTML_TAGS.test(selector)) {
    return selector;
  }

  // Bare alphanumeric identifier (with hyphens/underscores) - treat as testid
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(selector)) {
    return testid(selector);
  }

  // Fallback - use as-is
  return selector;
}
