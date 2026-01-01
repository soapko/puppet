import type { Page } from 'playwright';

export interface ElementErrorContext {
  selector: string;
  url: string;
  title: string;
  similarTestIds: string[];
  elementState: 'hidden' | 'covered' | 'not_found';
  coveredBy?: string;
}

/**
 * Gather context for element-related errors
 */
export async function getElementErrorContext(
  page: Page,
  selector: string
): Promise<ElementErrorContext> {
  const url = page.url();
  const title = await page.title().catch(() => 'Unknown');

  // Find similar data-testid values
  const similarTestIds = await page
    .evaluate(sel => {
      const testIds = Array.from(document.querySelectorAll('[data-testid]'))
        .map(el => el.getAttribute('data-testid'))
        .filter((id): id is string => id !== null);

      // Extract the testid from selector if it's a testid selector
      const match = sel.match(/data-testid=["']([^"']+)["']/);
      const targetId = match?.[1] ?? sel;

      // Find similar (simple string matching)
      return testIds
        .filter(id => {
          const idLower = id.toLowerCase();
          const targetLower = targetId.toLowerCase();
          return (
            idLower.includes(targetLower) ||
            targetLower.includes(idLower) ||
            id.split('-').some(part => targetLower.includes(part.toLowerCase()))
          );
        })
        .slice(0, 5);
    }, selector)
    .catch(() => [] as string[]);

  // Check if element exists but is hidden or covered
  let elementState: 'hidden' | 'covered' | 'not_found' = 'not_found';
  let coveredBy: string | undefined;

  try {
    const element = await page.$(selector);

    if (element) {
      const isVisible = await element.isVisible();

      if (!isVisible) {
        elementState = 'hidden';
      } else {
        // Check if covered by another element
        const box = await element.boundingBox();
        if (box) {
          const coverInfo = await page.evaluate(
            ({ x, y, targetSelector }) => {
              const el = document.elementFromPoint(x, y);
              if (!el) return null;

              const target = document.querySelector(targetSelector);
              if (target && (target.contains(el) || target === el)) {
                return null; // Not covered, hit the target or its child
              }

              return el.getAttribute('data-testid') || el.id || el.tagName.toLowerCase();
            },
            {
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              targetSelector: selector,
            }
          );

          if (coverInfo) {
            elementState = 'covered';
            coveredBy = coverInfo;
          }
        }
      }
    }
  } catch {
    // Element lookup failed, state remains 'not_found'
  }

  return { selector, url, title, similarTestIds, elementState, coveredBy };
}

/**
 * Format element error with context for better debugging
 */
export function formatElementError(context: ElementErrorContext): string {
  const lines: string[] = [`Element not found: ${context.selector}`];
  lines.push('');

  if (context.elementState === 'hidden') {
    lines.push('Status: Element EXISTS but is HIDDEN (display: none or visibility: hidden)');
  } else if (context.elementState === 'covered') {
    lines.push(`Status: Element EXISTS but is COVERED by: "${context.coveredBy}"`);
    lines.push('Dismiss the covering element before clicking.');
  } else {
    lines.push('Status: Element does not exist in the DOM');
  }

  if (context.similarTestIds.length > 0) {
    lines.push('');
    lines.push('Similar data-testid values on page:');
    context.similarTestIds.forEach(id => lines.push(`  - [data-testid="${id}"]`));
  }

  lines.push('');
  lines.push(`Page: ${context.title}`);
  lines.push(`URL: ${context.url}`);

  return lines.join('\n');
}

/**
 * Check if an error is likely an element-not-found error
 */
export function isElementNotFoundError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('element not found') ||
    msg.includes('no element matches') ||
    msg.includes('waiting for selector') ||
    msg.includes('failed to find')
  );
}
