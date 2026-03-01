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
// Self-healing: uses DOM lookups instead of closure refs so it survives SPA re-renders
const CURSOR_SCRIPT = `
(function() {
  function ensureCursor() {
    // Remove orphaned elements first
    var existing = document.getElementById('__puppet_cursor__');
    if (existing) existing.remove();
    var existingInd = document.getElementById('__puppet_cursor_click_indicator__');
    if (existingInd) existingInd.remove();

    // Create cursor element
    var cursor = document.createElement('div');
    cursor.id = '__puppet_cursor__';
    cursor.innerHTML = \`${CURSOR_SVG}\`;

    // Create click indicator
    var clickIndicator = document.createElement('div');
    clickIndicator.id = '__puppet_cursor_click_indicator__';

    // Add styles (only once per document)
    if (!document.getElementById('__puppet_cursor_styles__')) {
      var style = document.createElement('style');
      style.id = '__puppet_cursor_styles__';
      style.textContent = \`${CURSOR_STYLES}\`;
      (document.head || document.documentElement).appendChild(style);
    }

    // Append to body
    var container = document.body || document.documentElement;
    container.appendChild(cursor);
    container.appendChild(clickIndicator);

    // Restore last known position
    var cx = window.__puppetCursorX__ || 100;
    var cy = window.__puppetCursorY__ || 100;
    cursor.style.left = cx + 'px';
    cursor.style.top = cy + 'px';

    // Hide native cursor (only once per document)
    if (!document.getElementById('__puppet_cursor_hide__')) {
      var hideStyle = document.createElement('style');
      hideStyle.id = '__puppet_cursor_hide__';
      hideStyle.textContent = '* { cursor: none !important; }';
      (document.head || document.documentElement).appendChild(hideStyle);
      if (document.body) document.body.style.cursor = 'none';
      document.documentElement.style.cursor = 'none';
    }
  }

  // Helper: get cursor element, re-create if detached/missing
  function getCursor() {
    var el = document.getElementById('__puppet_cursor__');
    if (el && document.body && document.body.contains(el)) return el;
    ensureCursor();
    return document.getElementById('__puppet_cursor__');
  }

  function getClickIndicator() {
    return document.getElementById('__puppet_cursor_click_indicator__');
  }

  function initCursor() {
    ensureCursor();

    // Attach event listeners only once per window
    if (!window.__puppetCursorListeners__) {
      document.addEventListener('mousemove', function(e) {
        window.__puppetCursorX__ = e.clientX;
        window.__puppetCursorY__ = e.clientY;
        var el = document.getElementById('__puppet_cursor__');
        if (el) {
          el.style.left = e.clientX + 'px';
          el.style.top = e.clientY + 'px';
        }
      }, true);

      document.addEventListener('mousedown', function(e) {
        var el = document.getElementById('__puppet_cursor__');
        var ind = document.getElementById('__puppet_cursor_click_indicator__');
        if (el) el.classList.add('clicking');
        if (ind) {
          ind.style.left = e.clientX + 'px';
          ind.style.top = e.clientY + 'px';
          ind.classList.remove('active');
          void ind.offsetWidth;
          ind.classList.add('active');
        }
      }, true);

      document.addEventListener('mouseup', function() {
        var el = document.getElementById('__puppet_cursor__');
        if (el) el.classList.remove('clicking');
      }, true);

      window.__puppetCursorListeners__ = true;
    }

    // Self-healing move: re-creates cursor if it was removed by SPA framework
    window.__puppetMoveCursor__ = function(x, y) {
      window.__puppetCursorX__ = x;
      window.__puppetCursorY__ = y;
      var el = getCursor();
      if (el) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      }
    };

    // Self-healing click effect
    window.__puppetClickEffect__ = function(x, y) {
      var el = getCursor();
      var ind = getClickIndicator();
      if (el) el.classList.add('clicking');
      if (ind) {
        ind.style.left = x + 'px';
        ind.style.top = y + 'px';
        ind.classList.remove('active');
        void ind.offsetWidth;
        ind.classList.add('active');
      }
      setTimeout(function() {
        var c = document.getElementById('__puppet_cursor__');
        if (c) c.classList.remove('clicking');
      }, 100);
    };
  }

  // Initialize
  if (document.body) {
    initCursor();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCursor);
  } else {
    requestAnimationFrame(initCursor);
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
 * Set up visual cursor for CDP-connected pages.
 *
 * Uses Page.addScriptToEvaluateOnNewDocument via a CDP session, which is the
 * CDP equivalent of addInitScript — persists across navigations and runs before
 * page scripts. This works on reused CDP contexts where addInitScript does not.
 */
export async function setupVisualCursorCDP(page: Page): Promise<void> {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('Page.addScriptToEvaluateOnNewDocument', {
    source: CURSOR_SCRIPT,
  });
  // Also inject immediately for the current page
  await injectVisualCursor(page);
  await cdpSession.detach();
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
