/**
 * Injected recorder script
 *
 * This script is injected into the browser page to capture user interactions.
 * It sends events back to the Node.js process via the exposed callback function.
 */

/**
 * Get the injected script source code as a string
 *
 * This function returns the recorder script that will be injected into pages.
 */
export function getInjectedScript(): string {
  return `
(function() {
  // Prevent double injection
  if (window.__puppetRecorderActive) return;
  window.__puppetRecorderActive = true;

  // Debounce timers for input events
  const inputTimers = new Map();
  const DEBOUNCE_MS = 300;

  /**
   * Generate a stable selector for an element
   * Priority: data-testid > id > name > unique class > CSS path
   */
  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return null;
    }

    // Priority 1: data-testid attribute
    if (el.hasAttribute && el.hasAttribute('data-testid')) {
      return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    }

    // Priority 2: id attribute (if not dynamically generated)
    if (el.id && !/^[0-9]/.test(el.id) && !/[-_][a-f0-9]{6,}$/i.test(el.id)) {
      return '#' + CSS.escape(el.id);
    }

    // Priority 3: name attribute for form elements
    if (el.name && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
      const nameSelector = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector;
      }
    }

    // Priority 4: unique class combination
    if (el.classList && el.classList.length > 0) {
      const classes = Array.from(el.classList)
        .filter(c => !/^[0-9]/.test(c) && !/[-_][a-f0-9]{6,}$/i.test(c))
        .slice(0, 3);

      if (classes.length > 0) {
        const classSelector = el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }

    // Priority 5: CSS path (fallback)
    return generateCSSPath(el);
  }

  /**
   * Generate a CSS path selector for an element
   */
  function generateCSSPath(el) {
    const path = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      // Add nth-child if there are siblings of the same type
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + index + ')';
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // Stop if we have a unique selector
      if (path.length >= 2) {
        const testSelector = path.join(' > ');
        try {
          if (document.querySelectorAll(testSelector).length === 1) {
            return testSelector;
          }
        } catch {
          // Invalid selector, continue building path
        }
      }

      // Limit path depth
      if (path.length >= 5) break;
    }

    return path.join(' > ');
  }

  /**
   * Send a recorded event to the Node.js process
   */
  function recordEvent(type, target, data) {
    const selector = getSelector(target);
    if (!selector) return;

    const event = {
      type: type,
      selector: selector,
      timestamp: Date.now(),
      ...data
    };

    // Call the exposed callback if available
    if (typeof window.__puppetRecorderCallback === 'function') {
      window.__puppetRecorderCallback(event);
    }
  }

  /**
   * Handle click events
   */
  document.addEventListener('click', function(e) {
    const target = e.target;

    // Skip if it's a file input (handled separately)
    if (target.tagName === 'INPUT' && target.type === 'file') return;

    // Skip if clicking inside a select (option selection)
    if (target.tagName === 'OPTION') return;

    recordEvent('click', target);
  }, true);

  /**
   * Handle input events (with debouncing)
   */
  document.addEventListener('input', function(e) {
    const target = e.target;
    const selector = getSelector(target);
    if (!selector) return;

    // Clear existing timer for this element
    if (inputTimers.has(selector)) {
      clearTimeout(inputTimers.get(selector));
    }

    // Set new debounced timer
    inputTimers.set(selector, setTimeout(function() {
      inputTimers.delete(selector);
      recordEvent('type', target, { value: target.value || '' });
    }, DEBOUNCE_MS));
  }, true);

  /**
   * Handle change events (for select, checkbox, radio)
   */
  document.addEventListener('change', function(e) {
    const target = e.target;

    if (target.tagName === 'SELECT') {
      recordEvent('select', target, { value: target.value });
    } else if (target.type === 'checkbox') {
      recordEvent(target.checked ? 'check' : 'uncheck', target);
    } else if (target.type === 'radio') {
      recordEvent('click', target); // Treat radio as click
    }
  }, true);

  /**
   * Handle scroll events (debounced)
   */
  let scrollTimer = null;
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', function() {
    if (scrollTimer) clearTimeout(scrollTimer);

    scrollTimer = setTimeout(function() {
      const direction = window.scrollY > lastScrollY ? 'down' : 'up';
      lastScrollY = window.scrollY;

      recordEvent('scroll', document.body, { value: direction });
    }, 150);
  }, { passive: true });

  // Log that recorder is active
  console.log('[puppet] Recorder active - capturing user interactions');
})();
`;
}
