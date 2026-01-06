/**
 * Visual cursor for video recording
 *
 * Injects a visible cursor element that follows mouse movements,
 * making cursor visible in video recordings.
 */

import type { Page, BrowserContext } from 'playwright';

// SVG cursor icon (macOS-style pointer) - 48x48 for better visibility
const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <path fill="#000" stroke="#fff" stroke-width="1" d="M5.5 3.21V20.8l4.86-4.86h6.35L5.5 3.21z"/>
</svg>`;

// CSS for the visual cursor
const CURSOR_STYLES = `
#__puppet_cursor__ {
  position: fixed;
  top: 0;
  left: 0;
  width: 48px;
  height: 48px;
  pointer-events: none;
  z-index: 2147483647;
  transform: translate(-4px, -4px);
  transition: left 0.08s ease-out, top 0.08s ease-out;
  opacity: 1;
}
#__puppet_cursor__.clicking {
  transform: translate(-4px, -4px) scale(0.9);
}
#__puppet_cursor_click_indicator__ {
  position: fixed;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.5);
  pointer-events: none;
  z-index: 2147483646;
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
}
#__puppet_cursor_click_indicator__.active {
  animation: __puppet_click_ripple__ 0.4s ease-out forwards;
}
@keyframes __puppet_click_ripple__ {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}
`;

// JavaScript to inject into the page
const CURSOR_SCRIPT = `
(function() {
  // Prevent double initialization
  if (window.__puppetCursorInitialized__) return;
  window.__puppetCursorInitialized__ = true;

  function initCursor() {
    // Skip if already added
    if (document.getElementById('__puppet_cursor__')) return;

    // Create cursor element
    const cursor = document.createElement('div');
    cursor.id = '__puppet_cursor__';
    cursor.innerHTML = \`${CURSOR_SVG}\`;

    // Create click indicator
    const clickIndicator = document.createElement('div');
    clickIndicator.id = '__puppet_cursor_click_indicator__';

    // Add styles
    const style = document.createElement('style');
    style.id = '__puppet_cursor_styles__';
    style.textContent = \`${CURSOR_STYLES}\`;

    // Append to document
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }

    if (document.body) {
      document.body.appendChild(cursor);
      document.body.appendChild(clickIndicator);
    } else {
      document.documentElement.appendChild(cursor);
      document.documentElement.appendChild(clickIndicator);
    }

    // Track current position
    let cursorX = 100;
    let cursorY = 100;

    // Set initial position
    cursor.style.left = cursorX + 'px';
    cursor.style.top = cursorY + 'px';

    // Update cursor position on mouse move
    document.addEventListener('mousemove', (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      cursor.style.left = cursorX + 'px';
      cursor.style.top = cursorY + 'px';
    }, true);

    // Show click effect
    document.addEventListener('mousedown', (e) => {
      cursor.classList.add('clicking');
      clickIndicator.style.left = e.clientX + 'px';
      clickIndicator.style.top = e.clientY + 'px';
      clickIndicator.classList.remove('active');
      // Trigger reflow to restart animation
      void clickIndicator.offsetWidth;
      clickIndicator.classList.add('active');
    }, true);

    document.addEventListener('mouseup', () => {
      cursor.classList.remove('clicking');
    }, true);

    // Expose function to update cursor position programmatically
    window.__puppetMoveCursor__ = (x, y) => {
      cursorX = x;
      cursorY = y;
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
    };

    // Expose function to trigger click effect
    window.__puppetClickEffect__ = (x, y) => {
      cursor.classList.add('clicking');
      clickIndicator.style.left = x + 'px';
      clickIndicator.style.top = y + 'px';
      clickIndicator.classList.remove('active');
      void clickIndicator.offsetWidth;
      clickIndicator.classList.add('active');
      setTimeout(() => cursor.classList.remove('clicking'), 100);
    };

    // Hide native cursor
    if (document.body) {
      document.body.style.cursor = 'none';
    }
    document.documentElement.style.cursor = 'none';

    // Also hide cursor on all elements
    const hideCursorStyle = document.createElement('style');
    hideCursorStyle.textContent = '* { cursor: none !important; }';
    if (document.head) {
      document.head.appendChild(hideCursorStyle);
    } else {
      document.documentElement.appendChild(hideCursorStyle);
    }

    console.log('[puppet] Visual cursor initialized');
  }

  // Try to initialize immediately
  if (document.body) {
    initCursor();
  } else {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCursor);
    } else {
      // Fallback: use requestAnimationFrame
      requestAnimationFrame(initCursor);
    }
  }
})();
`;

/**
 * Inject visual cursor into a page
 */
export async function injectVisualCursor(page: Page): Promise<void> {
  await page.addScriptTag({ content: CURSOR_SCRIPT });
}

/**
 * Set up visual cursor to be automatically injected into all pages in a context
 */
export async function setupVisualCursor(context: BrowserContext): Promise<void> {
  // Add init script to inject cursor on every page load
  await context.addInitScript(CURSOR_SCRIPT);
}

/**
 * Programmatically move the visual cursor to coordinates
 */
export async function moveVisualCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
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
}

/**
 * Trigger a click effect at coordinates
 */
export async function triggerClickEffect(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
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
}
