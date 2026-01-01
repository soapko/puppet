# Puppet

Browser automation library with human-like cursor movements. Built on Playwright and ghost-cursor-playwright.

## Installation

```bash
npm install puppet
```

## Quick Start (Recommended)

The simplest way to use Puppet is with the fluent API and auto-managed sessions:

```javascript
import { withBrowser } from 'puppet';

await withBrowser(async browser => {
  await browser.goto('https://example.com');
  await browser.click('submit-btn'); // Clicks [data-testid="submit-btn"]
  await browser.type('email-input', 'test@example.com');
  await browser.waitForLoaded();

  const message = await browser.text('success-message');
  console.log(message);
});
// Browser automatically closes, even if errors occur
```

For more control without auto-cleanup:

```javascript
import { puppet } from 'puppet';

const browser = await puppet({ headless: false });
await browser.goto('https://example.com');
await browser.click('login-btn');
// ... more operations
await browser.close();
```

---

## Usage Modes

Puppet supports three usage modes:

1. **Fluent API** (Recommended) - Clean, method-based interface with smart selectors
2. **Script Mode** - Full programmatic control with Playwright page access
3. **Interactive Mode** - Persistent browser session controlled via file-based commands

---

## Fluent API (Recommended)

The fluent API provides a clean, intuitive interface for browser automation.

### Auto-Managed Sessions

Use `withBrowser` to ensure the browser always closes, even if errors occur:

```javascript
import { withBrowser } from 'puppet';

// Basic usage - browser auto-closes
await withBrowser(async browser => {
  await browser.goto('https://example.com');
  await browser.click('submit');
});

// Return values work
const title = await withBrowser(async browser => {
  await browser.goto('https://example.com');
  return await browser.title();
});

// Error handling - browser still closes
try {
  await withBrowser(async browser => {
    await browser.goto('https://example.com');
    throw new Error('Something went wrong');
  });
} catch (error) {
  console.log('Error caught, but browser is cleaned up');
}
```

### Manual Session Control

For more control, use `puppet()` directly:

```javascript
import { puppet } from 'puppet';

const browser = await puppet({ headless: false });

await browser.goto('https://example.com');
await browser.click('login-btn');
await browser.type('email', 'user@example.com');
await browser.type('#password', 'secret'); // CSS selector works too
await browser.click('submit');
await browser.waitForLoaded();

const welcome = await browser.text('welcome-message');
console.log(welcome);

await browser.close();
```

### Selector Shorthand

The fluent API uses smart selector resolution - bare strings are treated as `data-testid` values:

```javascript
// These are equivalent:
await browser.click('submit-btn'); // Bare string = testid
await browser.click('[data-testid="submit-btn"]'); // Explicit selector

// CSS selectors still work (., #, [ prefixes)
await browser.click('.btn-primary'); // Class selector
await browser.click('#submit'); // ID selector
await browser.click('[name="email"]'); // Attribute selector
```

You can also use the `testid` helper for explicit conversion:

```javascript
import { testid } from 'puppet';

console.log(testid('submit')); // '[data-testid="submit"]'
```

### Browser Methods

| Method                        | Description                     |
| ----------------------------- | ------------------------------- |
| `goto(url)`                   | Navigate to URL                 |
| `click(selector)`             | Click element                   |
| `type(selector, text)`        | Type text into input            |
| `clear(selector)`             | Clear input field               |
| `text(selector)`              | Get element text content        |
| `value(selector)`             | Get input value                 |
| `html(selector?)`             | Get HTML (element or full page) |
| `screenshot(path?)`           | Take screenshot                 |
| `select(selector, value)`     | Select dropdown option          |
| `check(selector)`             | Check checkbox                  |
| `uncheck(selector)`           | Uncheck checkbox                |
| `hover(selector)`             | Hover over element              |
| `scroll(direction, amount)`   | Scroll page                     |
| `wait(ms)`                    | Wait for milliseconds           |
| `waitFor(selector, timeout?)` | Wait for element                |
| `waitForLoaded(timeout?)`     | Wait for loading to complete    |
| `evaluate(script)`            | Execute JavaScript              |
| `upload(selector, path)`      | Upload file(s)                  |
| `frame(selector)`             | Switch to iframe                |
| `mainFrame()`                 | Switch to main frame            |
| `url()`                       | Get current URL                 |
| `title()`                     | Get page title                  |
| `clearState()`                | Clear cookies/storage           |
| `setDialogAction(action)`     | Set dialog behavior             |
| `getLastDialog()`             | Get last dialog message         |
| `close()`                     | Close browser                   |
| `isRunning()`                 | Check if browser is running     |
| `restart()`                   | Restart browser session         |

---

## Script Mode

Use the direct API for synchronous, script-controlled automation. The browser lifecycle is fully managed by your script.

### Quick Start

```javascript
import { getBrowser, createCursor } from 'puppet';

const { browser, page } = await getBrowser({ headless: false });
const cursor = createCursor(page);

await page.goto('https://example.com');
await cursor.click('button.submit');
await cursor.type('input[name="email"]', 'test@example.com');

await browser.close();
```

### Browser API

```javascript
import { getBrowser, launchBrowser, createContext, createPage } from 'puppet';

// Convenience function - returns ready-to-use browser, context, and page
const { browser, context, page } = await getBrowser({
  headless: false, // Show browser window (default: false)
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Custom UA',
  slowMo: 50, // Slow down operations for debugging
});

// Or use lower-level functions for more control
const browser = await launchBrowser({ headless: false });
const context = await createContext(browser, { viewport: { width: 1280, height: 720 } });
const page = await createPage(context);
```

### Cursor API

The cursor simulates human-like mouse movements using Bezier curves, with random hesitation and variable timing.

```javascript
import { createCursor } from 'puppet';

const cursor = createCursor(page, {
  moveSpeed: 1, // Speed multiplier (default: 1)
  hesitation: true, // Add random delays before actions (default: true)
  overshootSpread: 10, // Cursor overshoot for realism (default: 10)
});

// Click with human-like cursor movement
await cursor.click('button.submit');

// Double-click
await cursor.doubleClick('div.item');

// Type with variable keystroke delays
await cursor.type('input[name="search"]', 'hello world');

// Move cursor without clicking
await cursor.moveTo('nav.menu');
await cursor.moveToCoords(500, 300);

// Scroll
await cursor.scroll('down', 500); // Scroll down 500px in chunks
await cursor.scroll('up', 200); // Scroll up 200px
await cursor.scrollTo('footer'); // Scroll element into view

// Human-like pauses
await cursor.wait(1000, 2000); // Random delay between 1-2 seconds

// Idle behavior (random micro-movements)
await cursor.idle(3000); // 3 seconds of subtle mouse movement
```

---

## Interactive Mode

Keep a browser session running and send commands on-the-fly. Ideal for REPL-style interaction, external tool integration, or Claude-driven automation.

### Starting a Session

From the puppet directory:

```bash
cd /path/to/puppet
node start-session.mjs
```

Or programmatically:

```javascript
import { startSession } from 'puppet';

const session = await startSession({
  headless: false,
  commandFile: '~/.puppet/commands.json', // Default
  resultFile: '~/.puppet/results.json', // Default
  statusFile: '~/.puppet/status.json', // Default
});

// Session is now running and watching for commands
console.log('Session running:', session.isRunning());
console.log('Browser connected:', session.isBrowserConnected());
console.log('Current URL:', session.getUrl());

// If browser dies unexpectedly, recover with restart()
if (!session.isRunning()) {
  await session.restart();
}

// Close when done
await session.close();
```

### Sending Commands

Use the `sendCommand` helper from another process:

```javascript
import { sendCommand } from 'puppet';

// Navigate
await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });

// Click - using testid shorthand
await sendCommand({ action: 'click', params: { testid: 'login-btn' } });

// Click - bare string selector also works (smart resolution)
await sendCommand({ action: 'click', params: { selector: 'login-btn' } });

// Click - traditional CSS selector
await sendCommand({ action: 'click', params: { selector: 'button.login' } });

// Type
await sendCommand({ action: 'type', params: { testid: 'email-input', text: 'hello' } });

// Get result with timeout
const result = await sendCommand(
  { action: 'screenshot', params: { fullPage: true } },
  { timeout: 10000 }
);
console.log(result);
// { id: 'cmd-123', success: true, result: '/path/to/screenshot.png' }
```

Or write directly to the command file:

```bash
echo '{"id":"1","action":"goto","params":{"url":"https://example.com"}}' > ~/.puppet/commands.json
cat ~/.puppet/results.json
```

### Available Commands

| Action            | Params                                      | Description                                 |
| ----------------- | ------------------------------------------- | ------------------------------------------- |
| `goto`            | `url`                                       | Navigate to URL                             |
| `click`           | `selector`, `retry?`                        | Click element with human-like cursor        |
| `type`            | `selector`, `text`, `retry?`                | Type text into input field                  |
| `clear`           | `selector`                                  | Clear input field                           |
| `scroll`          | `direction` (`up`/`down`), `amount`         | Scroll page                                 |
| `screenshot`      | `fullPage` (boolean)                        | Capture screenshot, returns base64          |
| `evaluate`        | `script`                                    | Execute JavaScript, returns result          |
| `waitFor`         | `selector`, `timeout?`, `retry?`            | Wait for element to appear                  |
| `waitForLoaded`   | `selectors?`, `timeout?`, `waitForNetwork?` | Wait for loading indicators to disappear    |
| `getUrl`          | -                                           | Get current page URL                        |
| `getTitle`        | -                                           | Get page title                              |
| `setDialogAction` | `action` (`accept`/`dismiss`)               | Set behavior for alert/confirm dialogs      |
| `getLastDialog`   | -                                           | Get message from last dialog                |
| `clearState`      | `includeIndexedDB?`                         | Clear cookies, localStorage, sessionStorage |
| `uploadFile`      | `selector`, `filePath`                      | Upload file(s) to file input                |
| `switchToFrame`   | `selector`                                  | Switch context into an iframe               |
| `switchToMain`    | -                                           | Switch back to main page context            |
| `getFrames`       | -                                           | List all frames on the page                 |
| `init` / `noop`   | -                                           | No-op, useful for testing connection        |
| `close`           | -                                           | Close the session                           |

### Command/Result Format

**Command:**

```json
{
  "id": "unique-id",
  "action": "click",
  "params": {
    "selector": "button.submit"
  }
}
```

**Result:**

```json
{
  "id": "unique-id",
  "success": true,
  "result": null
}
```

**Error result:**

```json
{
  "id": "unique-id",
  "success": false,
  "error": "Element not found: button.submit",
  "screenshotPath": "/Users/you/.puppet/failures/error-1234567890.png"
}
```

### Retry Options

Commands that interact with elements (`click`, `type`, `waitFor`) support an optional `retry` parameter for handling flaky elements:

```javascript
// Retry up to 3 times with exponential backoff
await sendCommand({
  action: 'click',
  params: { selector: '[data-testid="slow-button"]', retry: 3 },
});

// Custom retry configuration
await sendCommand({
  action: 'click',
  params: {
    selector: '[data-testid="slow-button"]',
    retry: { maxAttempts: 5, initialDelay: 200, maxDelay: 3000 },
  },
});
```

### Test Isolation

Clear browser state between tests:

```javascript
await sendCommand({ action: 'clearState' });
// Clears cookies, localStorage, sessionStorage

await sendCommand({ action: 'clearState', params: { includeIndexedDB: true } });
// Also clears IndexedDB
```

### Working with iframes

```javascript
// List all frames
const frames = await sendCommand({ action: 'getFrames' });

// Switch to iframe (e.g., for payment forms)
await sendCommand({ action: 'switchToFrame', params: { selector: 'iframe[name="payment"]' } });

// Interact within iframe
await sendCommand({ action: 'type', params: { selector: '#card-number', text: '4242...' } });

// Return to main page
await sendCommand({ action: 'switchToMain' });
```

### File Uploads

```javascript
// Single file
await sendCommand({
  action: 'uploadFile',
  params: { selector: 'input[type="file"]', filePath: '/path/to/file.pdf' },
});

// Multiple files
await sendCommand({
  action: 'uploadFile',
  params: { selector: '[data-testid="attachments"]', filePath: ['./a.jpg', './b.jpg'] },
});
```

### Waiting for Loading States

Wait for common loading indicators to disappear:

```javascript
// Uses smart defaults (looks for [data-loading], .spinner, .skeleton, etc.)
await sendCommand({ action: 'waitForLoaded' });

// Custom selectors
await sendCommand({
  action: 'waitForLoaded',
  params: { selectors: ['[data-testid="custom-loader"]'], timeout: 5000 },
});

// Skip network idle check for speed
await sendCommand({ action: 'waitForLoaded', params: { waitForNetwork: false } });
```

### Debug Mode

Enable verbose logging:

```bash
PUPPET_DEBUG=1 node start-session.mjs
```

---

## Examples

### Automated Test Script

```javascript
import { getBrowser, createCursor } from 'puppet';

async function testLogin() {
  const { browser, page } = await getBrowser({ headless: false });
  const cursor = createCursor(page);

  try {
    await page.goto('https://myapp.com/login');
    await cursor.wait(500, 1000);

    await cursor.type('#username', 'testuser');
    await cursor.type('#password', 'testpass');
    await cursor.click('button[type="submit"]');

    await page.waitForURL('**/dashboard/**');
    console.log('Login successful!');

    await page.screenshot({ path: 'dashboard.png' });
  } finally {
    await browser.close();
  }
}

testLogin();
```

### Interactive Session with External Control

**Terminal 1 - Start session:**

```bash
node start-session.mjs
```

**Terminal 2 - Send commands:**

```javascript
import { sendCommand } from 'puppet';

await sendCommand({ action: 'goto', params: { url: 'https://news.ycombinator.com' } });
await sendCommand({ action: 'screenshot', params: { fullPage: false } });

const title = await sendCommand({ action: 'getTitle' });
console.log('Page title:', title.result);

await sendCommand({ action: 'click', params: { selector: '.morelink' } });
```

---

## API Reference

### Browser Functions

| Function                           | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `getBrowser(options?)`             | Launch browser and return `{ browser, context, page }` |
| `launchBrowser(options?)`          | Launch raw Chromium browser                            |
| `createContext(browser, options?)` | Create browser context with viewport/UA                |
| `createPage(context)`              | Create page from context                               |

### Cursor Methods

| Method                       | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `click(selector)`            | Move to element and click                   |
| `doubleClick(selector)`      | Move to element and double-click            |
| `type(selector, text)`       | Click element and type with variable delays |
| `moveTo(selector)`           | Move cursor to element                      |
| `moveToCoords(x, y)`         | Move cursor to coordinates                  |
| `scroll(direction, amount?)` | Scroll in chunks                            |
| `scrollTo(selector)`         | Scroll element into view                    |
| `wait(min?, max?)`           | Random delay                                |
| `idle(duration?)`            | Random micro-movements                      |

### Session Functions

| Function                         | Description                                          |
| -------------------------------- | ---------------------------------------------------- |
| `startSession(options?)`         | Start interactive session                            |
| `sendCommand(command, options?)` | Send command to running session (fails fast if dead) |

### Session Methods

| Method                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `close()`              | Close the session and browser                     |
| `getUrl()`             | Get the current page URL                          |
| `isRunning()`          | Check if session is running and browser connected |
| `isBrowserConnected()` | Check if browser is still connected               |
| `restart()`            | Restart session with fresh browser (for recovery) |

---

## Configuration

### BrowserOptions

```typescript
interface BrowserOptions {
  headless?: boolean; // Default: false
  viewport?: { width: number; height: number };
  userAgent?: string;
  slowMo?: number;
}
```

### CursorOptions

```typescript
interface CursorOptions {
  moveSpeed?: number; // Default: 1
  hesitation?: boolean; // Default: true
  overshootSpread?: number; // Default: 10
}
```

### SessionOptions

```typescript
interface SessionOptions {
  commandFile?: string; // Default: ~/.puppet/commands.json
  resultFile?: string; // Default: ~/.puppet/results.json
  statusFile?: string; // Default: ~/.puppet/status.json
  headless?: boolean; // Default: false
  viewport?: { width: number; height: number };
}
```

---

## Troubleshooting

### Browser Closed Unexpectedly During Session

If the browser window is closed manually or crashes while a session is running:

1. The session automatically detects the closure via event listeners
2. `session.isRunning()` and `session.isBrowserConnected()` will return `false`
3. `sendCommand()` will fail fast with a clear error instead of timing out
4. Call `session.restart()` to recover without recreating the session

**Example recovery pattern:**

```javascript
const result = await sendCommand({ action: 'click', params: { selector: '.btn' } });

if (!result.success && result.error?.includes('disconnected')) {
  console.log('Browser died, restarting...');
  await session.restart();
  // Retry the command
  await sendCommand({ action: 'click', params: { selector: '.btn' } });
}
```

**Or check before sending:**

```javascript
if (!session.isRunning()) {
  await session.restart();
}
await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });
```

### Session Server Not Responding

If commands aren't being processed:

1. **Check if session is running** (from anywhere):

   ```bash
   ps aux | grep start-session
   ```

2. **Restart the session:**

   ```bash
   # Kill existing session if hung (from anywhere)
   pkill -f start-session.mjs

   # Start fresh (from puppet directory)
   cd /path/to/puppet
   node start-session.mjs
   ```

3. **Clear stale command/result files:**
   ```bash
   rm ~/.puppet/commands.json ~/.puppet/results.json
   cd /path/to/puppet
   node start-session.mjs
   ```

### Command Timeouts

Commands may timeout if:

- The page is slow to load
- An element isn't present on the page
- The selector is incorrect

**Solutions:**

1. **Increase timeout when sending commands:**

   ```javascript
   await sendCommand(
     { action: 'click', params: { selector: '.slow-element' } },
     { timeout: 30000 } // 30 seconds
   );
   ```

2. **Wait for elements before clicking:**

   ```javascript
   await sendCommand({ action: 'waitFor', params: { selector: '.button', timeout: 10000 } });
   await sendCommand({ action: 'click', params: { selector: '.button' } });
   ```

3. **Check for navigation completion:**
   ```javascript
   await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });
   await sendCommand({ action: 'waitFor', params: { selector: 'body', timeout: 5000 } });
   ```

### Race Conditions

Commands are processed sequentially, but if you're sending commands from multiple processes or too quickly:

1. **Always wait for command results before sending the next:**

   ```javascript
   // Good - sequential
   const result1 = await sendCommand({ action: 'goto', params: { url: '...' } });
   const result2 = await sendCommand({ action: 'click', params: { selector: '...' } });

   // Bad - parallel (may cause issues)
   await Promise.all([
     sendCommand({ action: 'goto', params: { url: '...' } }),
     sendCommand({ action: 'click', params: { selector: '...' } }),
   ]);
   ```

2. **Add explicit waits between rapid interactions:**

   ```javascript
   await sendCommand({ action: 'click', params: { selector: 'button.submit' } });
   await sendCommand({
     action: 'waitFor',
     params: { selector: '.success-message', timeout: 5000 },
   });
   ```

3. **Use unique command IDs to track responses:**
   ```javascript
   const id = `cmd-${Date.now()}`;
   await sendCommand({ id, action: 'screenshot', params: {} });
   ```

### Element Not Found Errors

If you get "Element not found" errors:

1. **Verify the selector in browser DevTools:**
   - Right-click element > Inspect
   - Test selector in Console: `document.querySelector('your-selector')`

2. **Wait for dynamic content:**

   ```javascript
   await sendCommand({ action: 'waitFor', params: { selector: '.dynamic-content' } });
   await sendCommand({ action: 'click', params: { selector: '.dynamic-content button' } });
   ```

3. **Check if element is in an iframe:**
   - Use `switchToFrame` to switch context into the iframe
   - Use `switchToMain` to return to the main page
   - See "Working with iframes" section above

### Debug Mode

Enable verbose logging to diagnose issues:

```bash
PUPPET_DEBUG=1 node start-session.mjs
```

This shows:

- Command file watch events
- Each command received and its parameters
- Command execution results
- Timing information

### Stale Session State

If the session seems stuck or behaving unexpectedly:

1. **Reset the session completely:**

   ```bash
   # Stop any running sessions (from anywhere)
   pkill -f start-session.mjs

   # Clear command/result files (from anywhere)
   rm -rf ~/.puppet/

   # Start fresh (from puppet directory)
   cd /path/to/puppet
   node start-session.mjs
   ```

2. **Navigate to a known state:**
   ```javascript
   await sendCommand({ action: 'goto', params: { url: 'about:blank' } });
   await sendCommand({ action: 'goto', params: { url: 'https://your-start-page.com' } });
   ```

---

## License

MIT
