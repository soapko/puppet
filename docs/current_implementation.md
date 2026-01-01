# Current Implementation

Overview of implemented features and important implementation details.

---

## WebSocket Mode

**Implemented:** 2026-01-01

Real-time, bidirectional browser control via WebSocket.

### Files

- `src/websocket.ts` - WebSocket server implementation
- `src/cli.ts` - CLI entry point (`puppet ws`)

### Starting the Server

```bash
npx puppet ws --port=3001 --headless
```

### Protocol

| Direction       | Message Type | Description                            |
| --------------- | ------------ | -------------------------------------- |
| Server → Client | `ready`      | Sent on connection                     |
| Client → Server | `command`    | Command with `id` and `command` object |
| Server → Client | `result`     | Result with matching `id`              |
| Server → Client | `error`      | Error with optional `id`               |

### Programmatic Usage

```typescript
import { serveWebSocket, stopWebSocketServer } from 'puppet';

const wss = await serveWebSocket({ port: 3001, headless: true });

// Later...
await stopWebSocketServer(wss);
```

---

## Fluent API & Ease of Use

**Implemented:** 2026-01-01

### TestID Shorthand & Smart Selector Resolution

Intelligent selector resolution in `src/selectors.ts` that auto-detects selector type:

```typescript
// In session.ts processCommand
if (params.testid && !params.selector) {
  params.selector = `[data-testid="${params.testid}"]`;
}
if (params.selector && typeof params.selector === 'string') {
  params.selector = resolveSelector(params.selector);
}
```

**Resolution Rules:**

| Input          | Type       | Resolved                     |
| -------------- | ---------- | ---------------------------- |
| `submit-btn`   | testid     | `[data-testid="submit-btn"]` |
| `loginForm`    | testid     | `[data-testid="loginForm"]`  |
| `#submit`      | CSS ID     | `#submit`                    |
| `.btn`         | CSS class  | `.btn`                       |
| `[name=email]` | attribute  | `[name=email]`               |
| `button`       | HTML tag   | `button`                     |
| `div.class`    | complex    | `div.class`                  |
| `form input`   | descendant | `form input`                 |
| `ul > li`      | child      | `ul > li`                    |
| `:first-child` | pseudo     | `:first-child`               |

**Usage:**

- `testid` param: `{ action: 'click', params: { testid: 'btn' } }`
- Smart resolution: `{ action: 'click', params: { selector: 'btn' } }` → `[data-testid="btn"]`
- CSS selectors pass through: `.class`, `#id`, `[attr]`
- HTML tags preserved: `button`, `input`, `div`, etc.
- Complex selectors preserved: `form input`, `ul > li`, `div.foo`

### Fluent API (`src/fluent.ts`)

Method-based interface wrapping `sendCommand`:

```typescript
import { puppet, withBrowser, Browser } from 'puppet';

// Manual control
const browser = await puppet({ headless: false });
await browser.goto('https://example.com');
await browser.click('submit-btn'); // Uses smart selector resolution
await browser.close();

// Auto-managed (recommended)
await withBrowser(async browser => {
  await browser.goto('https://example.com');
  await browser.click('submit');
}); // Auto-closes
```

**Browser Methods:** `goto`, `click`, `type`, `clear`, `text`, `value`, `html`, `screenshot`, `select`, `check`, `uncheck`, `hover`, `scroll`, `wait`, `waitFor`, `waitForLoaded`, `evaluate`, `upload`, `frame`, `mainFrame`, `url`, `title`, `clearState`, `setDialogAction`, `getLastDialog`, `close`, `isRunning`, `restart`

### Exports

```typescript
// src/index.ts
export { puppet, withBrowser, Browser } from './fluent.js';
export { testid, resolveSelector } from './selectors.js';
```

---

## Session Lifecycle Management

**Implemented:** 2026-01-01

The session module (`src/session.ts`) includes robust lifecycle management:

### Browser Disconnect Detection

- `browser.on('disconnected')` handler marks session as dead
- `page.on('close')` handler detects unexpected page closure
- `isBrowserDeadError()` helper classifies fatal errors during command execution

### Health Checks

- Commands fail fast with clear error message if browser is disconnected
- `isRunning()` returns `false` when browser is dead (not just when `close()` was called)

### Recovery

- `session.restart()` method allows recovery after browser death
- Restarts browser, reattaches event listeners, resets state
- Tests can call `restart()` to recover from unexpected closures

### Session API

```typescript
session.isRunning(); // true only if running AND browser connected
session.isBrowserConnected(); // check browser connection state
await session.restart(); // recover from browser death
await session.close(); // graceful shutdown
```

### sendCommand Fail-Fast

`sendCommand()` checks session status before sending commands and periodically while waiting:

- **Before sending:** Reads `~/.puppet/status.json` to verify session is running
- **While waiting:** Checks status every 500ms to detect if browser died
- **On failure:** Returns immediately with clear error instead of timing out

```typescript
// If browser is dead, returns immediately:
{
  id: 'pre-check',
  success: false,
  error: 'Browser disconnected. Call restart() to recover.'
}
```

---

## Built-in Assertions

**Implemented:** 2026-01-01

Assertion commands that verify page state and throw clear errors on failure.

### Available Assertions

| Command           | Params                           | Description                             |
| ----------------- | -------------------------------- | --------------------------------------- |
| `assertVisible`   | `selector`                       | Assert element is visible               |
| `assertHidden`    | `selector`                       | Assert element is hidden or not present |
| `assertText`      | `selector`, `expected`, `exact?` | Assert text content matches             |
| `assertValue`     | `selector`, `expected`           | Assert input value matches              |
| `assertChecked`   | `selector`                       | Assert checkbox/radio is checked        |
| `assertUnchecked` | `selector`                       | Assert checkbox/radio is not checked    |
| `assertEnabled`   | `selector`                       | Assert element is enabled               |
| `assertDisabled`  | `selector`                       | Assert element is disabled              |
| `assertUrl`       | `expected`, `exact?`             | Assert current URL matches              |
| `assertTitle`     | `expected`, `exact?`             | Assert page title matches               |
| `assertCount`     | `selector`, `count`              | Assert number of matching elements      |

### Usage

```typescript
import { withBrowser } from 'puppet';

await withBrowser(async browser => {
  await browser.goto('https://example.com');

  // Element assertions
  await browser.assertVisible('login-form');
  await browser.assertHidden('loading-spinner');
  await browser.assertText('heading', 'Welcome');
  await browser.assertText('heading', 'Welc', false); // contains mode

  // Form assertions
  await browser.assertValue('email-input', 'test@example.com');
  await browser.assertChecked('remember-me');
  await browser.assertDisabled('submit-btn');

  // Page assertions
  await browser.assertUrl('/dashboard', false); // contains
  await browser.assertTitle('Dashboard');
  await browser.assertCount('list-item', 5);
});
```

### Error Messages

Assertions throw descriptive errors on failure:

```
Assertion failed: Text mismatch
  Selector: [data-testid="heading"]
  Expected: "Hello"
  Actual: "Welcome"
  Mode: exact
```

---

## HTTP Server Mode

**Implemented:** 2026-01-01

REST API for language-agnostic browser automation.

### Files

- `src/server.ts` - HTTP server implementation with REST endpoints
- `src/cli.ts` - CLI entry point (`puppet serve`)

### Starting the Server

```bash
# CLI
npx puppet serve --port=3000 --headless

# Programmatic
import { serve } from 'puppet';
const server = await serve({ port: 3000, headless: true });
```

### Endpoints

| Endpoint      | Method | Description                     |
| ------------- | ------ | ------------------------------- |
| `/command`    | POST   | Execute any command (JSON body) |
| `/goto`       | GET    | Navigate to URL                 |
| `/click`      | GET    | Click element                   |
| `/type`       | GET    | Type text                       |
| `/text`       | GET    | Get text content                |
| `/screenshot` | GET    | Take screenshot                 |
| `/url`        | GET    | Get current URL                 |
| `/title`      | GET    | Get page title                  |
| `/health`     | GET    | Health check                    |
| `/close`      | GET    | Close browser and server        |

### Features

- CORS headers for browser access
- GET shortcuts for common commands
- POST `/command` for any command
- Health check with browser/session status
- Graceful shutdown on `/close`

---

## Stdio JSON Protocol

**Implemented:** 2026-01-01

JSON protocol over stdin/stdout for subprocess integration.

### Files

- `src/stdio.ts` - Stdio mode implementation
- `src/cli.ts` - CLI entry point (`puppet stdio`)

### Starting Stdio Mode

```bash
npx puppet stdio --headless
```

### Protocol

- Outputs `{"ready":true}` when browser is initialized
- Accepts one JSON command per line on stdin
- Outputs one JSON result per line on stdout
- Session logs go to stderr (can be suppressed with `2>/dev/null`)

### Session Direct Command

The Session interface now exposes a `command()` method for direct command execution:

```typescript
interface Session {
  // ...existing methods...
  command(cmd: Omit<Command, 'id'>): Promise<CommandResult>;
}
```

This bypasses file-based IPC and enables stdio mode to process commands directly.

---

## REPL Mode

**Implemented:** 2026-01-01

Interactive command-line for exploring and debugging browser automation.

### Files

- `src/repl.ts` - REPL implementation with readline
- `src/cli.ts` - CLI entry point (`puppet repl`)

### Starting REPL

```bash
npx puppet repl
```

### Features

- Interactive readline-based prompt with command history
- Smart selector resolution (bare strings → testid)
- All common browser commands: goto, click, type, text, screenshot, etc.
- Command aliases for quick access (c = click, t = type, ss = screenshot)
- Clean exit on Ctrl+C or `exit` command

---

## Test Runner Integration

**Implemented:** 2026-01-01

First-class Vitest integration for browser testing with custom matchers.

### Files

- `src/test/index.ts` - Package entry point
- `src/test/runner.ts` - Vitest test wrapper with `page` fixture
- `src/test/matchers.ts` - Custom expect matchers
- `src/test/config.ts` - Configuration utilities

### Package Export

```json
{
  "exports": {
    "./test": {
      "import": "./dist/test/index.js",
      "types": "./dist/test/index.d.ts"
    }
  }
}
```

### Usage

```typescript
import { test, expect, setupPuppet } from 'puppet/test';

setupPuppet();

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.type('email', 'user@example.com');
  await page.click('submit');

  await expect(page).toHaveURL('/dashboard');
  await expect(page).toHaveText('welcome', 'Hello');
});
```

### Custom Matchers

- `toHaveURL(expected)` - Assert URL matches
- `toHaveTitle(expected)` - Assert title matches
- `toHaveText(selector, expected)` - Assert element text
- `toBeVisible(selector)` - Assert element visible
- `toBeHidden(selector)` - Assert element hidden
- `toHaveValue(selector, expected)` - Assert input value
- `toBeChecked(selector)` - Assert checkbox checked
- `toBeEnabled(selector)` - Assert element enabled
- `toBeDisabled(selector)` - Assert element disabled
- `toHaveCount(selector, count)` - Assert element count

### Configuration

```typescript
import { defineConfig } from 'puppet/test';

export default defineConfig({
  baseURL: 'http://localhost:3000',
  headless: true,
  screenshotOnFailure: true,
});
```
