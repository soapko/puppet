# Puppet

Browser automation with human-like cursor movements. Built on Playwright.

Puppet provides a clean API for browser automation that simulates realistic human behavior — Bezier-curve mouse movements, variable typing speeds, and random micro-hesitations. Use it for testing, scraping, or anything that needs a browser.

## Installation

```bash
npm install puppet
```

Playwright browsers are installed automatically. If needed manually:

```bash
npx playwright install chromium
```

## Quick Start

```javascript
import { withBrowser } from 'puppet';

await withBrowser(async browser => {
  await browser.goto('https://example.com');
  await browser.click('submit-btn'); // clicks [data-testid="submit-btn"]
  await browser.type('email', 'test@example.com');
  await browser.waitForLoaded();

  const message = await browser.text('success-message');
  console.log(message);
});
// Browser automatically closes, even if errors occur
```

## Features

- **Human-like cursor** — Bezier curves, overshoot, hesitation, variable timing
- **Smart selectors** — Bare strings resolve to `data-testid`, CSS selectors pass through
- **Fluent API** — Clean `browser.click()` / `browser.type()` interface with auto-cleanup
- **Test runner** — First-class Vitest integration with custom matchers
- **Multiple modes** — HTTP server, WebSocket, stdio, REPL, recording, interactive session
- **Built-in assertions** — `assertVisible`, `assertText`, `assertUrl`, and more
- **Video recording** — Record sessions with visual cursor overlay
- **Retry support** — Exponential backoff for flaky elements

## Usage Modes

| Mode                                | Start                             | Use Case                              |
| ----------------------------------- | --------------------------------- | ------------------------------------- |
| [Fluent API](#fluent-api)           | `puppet()` / `withBrowser()`      | Programmatic automation (recommended) |
| [Test Runner](#test-runner)         | `import from 'puppet/test'`       | Vitest browser tests                  |
| [HTTP Server](#http-server)         | `npx puppet serve`                | Language-agnostic REST API            |
| [WebSocket](#websocket)             | `npx puppet ws`                   | Real-time bidirectional control       |
| [Stdio](#stdio)                     | `npx puppet stdio`                | Subprocess JSON protocol              |
| [REPL](#repl)                       | `npx puppet repl`                 | Interactive exploration               |
| [Recorder](#recorder)               | `npx puppet record`               | Generate tests from interactions      |
| [Script](#script-mode)              | `getBrowser()` + `createCursor()` | Direct Playwright access              |
| [Interactive](#interactive-session) | `startSession()`                  | Persistent file-based commands        |

---

## Fluent API

The recommended way to use Puppet. Auto-manages browser lifecycle and uses smart selectors.

```javascript
import { puppet, withBrowser } from 'puppet';

// Auto-cleanup (recommended)
await withBrowser(async browser => {
  await browser.goto('https://example.com');
  await browser.click('login-btn');
  await browser.type('email', 'user@example.com');
  await browser.type('#password', 'secret'); // CSS selectors work too
  await browser.click('submit');
  await browser.waitForLoaded();
});

// Manual control
const browser = await puppet({ headless: false });
await browser.goto('https://example.com');
// ...
await browser.close();
```

### Smart Selectors

Bare alphanumeric strings become `data-testid` selectors. CSS selectors and HTML tags pass through unchanged:

```javascript
await browser.click('submit-btn'); // → [data-testid="submit-btn"]
await browser.click('.btn-primary'); // → .btn-primary
await browser.click('#submit'); // → #submit
await browser.click('button'); // → button
await browser.click('[name="email"]'); // → [name="email"]
```

### Methods

| Method                                  | Description                     |
| --------------------------------------- | ------------------------------- |
| `goto(url)`                             | Navigate to URL                 |
| `click(selector)`                       | Click element                   |
| `drag(source, target)`                  | Drag element to target          |
| `type(selector, text)`                  | Type text into input            |
| `clear(selector)`                       | Clear input field               |
| `text(selector)`                        | Get element text content        |
| `value(selector)`                       | Get input value                 |
| `html(selector?)`                       | Get HTML (element or full page) |
| `screenshot(path?)`                     | Take screenshot                 |
| `select(selector, value)`               | Select dropdown option          |
| `check(selector)` / `uncheck(selector)` | Toggle checkbox                 |
| `hover(selector)`                       | Hover over element              |
| `scroll(direction, amount)`             | Scroll page                     |
| `waitFor(selector, timeout?)`           | Wait for element                |
| `waitForLoaded(timeout?)`               | Wait for loading to complete    |
| `evaluate(script)`                      | Execute JavaScript              |
| `upload(selector, path)`                | Upload file(s)                  |
| `frame(selector)` / `mainFrame()`       | Switch iframe context           |
| `url()` / `title()`                     | Get current URL or title        |
| `clearState()`                          | Clear cookies/storage           |
| `setDialogAction(action)`               | Set dialog behavior             |
| `close()`                               | Close browser                   |

### Built-in Assertions

```javascript
await browser.assertVisible('login-form');
await browser.assertText('heading', 'Welcome');
await browser.assertUrl('/dashboard');
await browser.assertValue('email', 'user@test.com');
await browser.assertEnabled('submit-btn');
await browser.assertCount('cart-item', 3);
```

---

## Test Runner

First-class Vitest integration with custom matchers.

```typescript
import { test, expect, setupPuppet } from 'puppet/test';

setupPuppet();

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.type('email', 'user@example.com');
  await page.type('password', 'secret123');
  await page.click('submit');

  await expect(page).toHaveURL('/dashboard');
  await expect(page).toHaveText('welcome', 'Hello, User');
});
```

### Custom Matchers

```typescript
await expect(page).toBeVisible('login-form');
await expect(page).toBeHidden('loading-spinner');
await expect(page).toHaveText('heading', 'Welcome');
await expect(page).toHaveValue('email', 'test@example.com');
await expect(page).toBeChecked('remember-me');
await expect(page).toBeEnabled('submit');
await expect(page).toHaveCount('cart-item', 3);
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveTitle('Dashboard');
```

### Configuration

Create `puppet.config.ts`:

```typescript
import { defineConfig } from 'puppet/test';

export default defineConfig({
  baseURL: 'http://localhost:3000',
  headless: true,
  viewport: { width: 1440, height: 900 },
  timeout: 30000,
  screenshotOnFailure: true,
  screenshotDir: './test-results',
  video: false,
});
```

For comprehensive testing documentation — setup, patterns, best practices, and more — see **[Writing Tests with Puppet](docs/writing-tests-with-puppet.md)**.

---

## HTTP Server

Language-agnostic browser control via REST API.

```bash
npx puppet serve                     # port 3000, visible browser
npx puppet serve --port=8080 --headless
```

```bash
curl "http://localhost:3000/goto?url=https://example.com"
curl "http://localhost:3000/click?testid=submit-btn"
curl "http://localhost:3000/text?selector=h1"
curl "http://localhost:3000/screenshot?path=./shot.png"
```

Or from Python:

```python
import requests
requests.get("http://localhost:3000/goto", params={"url": "https://example.com"})
requests.get("http://localhost:3000/click", params={"testid": "login-btn"})
```

---

## WebSocket

Real-time bidirectional control with lower latency.

```bash
npx puppet ws                        # port 3001, visible browser
npx puppet ws --port=8080 --headless
```

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = event => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'ready') {
    ws.send(
      JSON.stringify({
        type: 'command',
        id: '1',
        command: { action: 'goto', params: { url: 'https://example.com' } },
      })
    );
  }
};
```

---

## Stdio

JSON protocol over stdin/stdout for subprocess integration.

```bash
npx puppet stdio --headless
```

```bash
echo '{"action":"goto","params":{"url":"https://example.com"}}
{"action":"getTitle"}
{"action":"close"}' | npx puppet stdio --headless 2>/dev/null
```

Works from any language — Node.js, Python, Ruby, Go — anything that can spawn a process and read/write lines.

---

## REPL

Interactive command-line for exploration and debugging.

```bash
npx puppet repl
```

```
puppet> goto https://example.com
Navigated to https://example.com

puppet> text h1
Example Domain

puppet> click submit-btn
Clicked submit-btn

puppet> screenshot ./debug.png
Screenshot saved: ./debug.png

puppet> exit
```

Supports aliases: `c` for click, `t` for type, `ss` for screenshot, `wl` for waitloaded.

---

## Recorder

Capture browser interactions and generate test code.

```bash
npx puppet record --url=https://example.com --output=tests/login.test.ts
```

Interact with the browser, then press Ctrl+C. Puppet generates a test file:

```typescript
import { test } from 'puppet/test';

test('recorded test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('login-btn');
  await page.type('email', 'user@test.com');
  await page.click('submit');
});
```

Supports `--format=playwright` for Playwright output. Prioritizes `data-testid` selectors for stability.

The recorder captures drag-and-drop interactions too — generating `page.drag()` for puppet format and `page.dragAndDrop()` for Playwright format.

---

## Script Mode

Direct access to Playwright's page object with Puppet's human-like cursor.

```javascript
import { getBrowser, createCursor } from 'puppet';

const { browser, page } = await getBrowser({ headless: false });
const cursor = createCursor(page);

await page.goto('https://example.com');
await cursor.click('button.submit');
await cursor.type('input[name="email"]', 'test@example.com');
await cursor.scroll('down', 500);
await cursor.idle(2000); // Random micro-movements

await browser.close();
```

---

## Interactive Session

Persistent browser controlled via file-based commands. Good for external tool integration.

```javascript
import { startSession, sendCommand } from 'puppet';

const session = await startSession({ headless: false });

await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });
await sendCommand({ action: 'click', params: { testid: 'login-btn' } });
await sendCommand({ action: 'screenshot' });

const title = await sendCommand({ action: 'getTitle' });
console.log(title.result);

await session.close();
```

---

## Configuration

### Browser Options

```typescript
{
  headless?: boolean;          // Default: false
  viewport?: { width: number; height: number };  // Default: 1440x900
  userAgent?: string;
  slowMo?: number;
  video?: boolean | { dir?: string; size?: { width: number; height: number } };
  showCursor?: boolean;        // Visual cursor overlay (auto-enabled with video)
}
```

### Video Recording

```typescript
// Record to default ./videos/ directory
const browser = await puppet({ video: true });

// Custom directory
const browser = await puppet({ video: { dir: './recordings' } });

// Visual cursor without recording
const browser = await puppet({ showCursor: true });
```

---

## Documentation

- **[Writing Tests with Puppet](docs/writing-tests-with-puppet.md)** — Comprehensive guide for test setup, selectors, assertions, patterns, configuration, and best practices
- **[Full API Reference](how-to-use-puppet.md)** — Detailed docs for all modes, methods, and options

---

## License

MIT
