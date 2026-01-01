# Current Implementation

Overview of implemented features and important implementation details.

---

## Fluent API & Ease of Use

**Implemented:** 2026-01-01

### TestID Shorthand

Selector resolution that treats bare strings as `data-testid` values:

```typescript
// In session.ts processCommand
if (params.testid && !params.selector) {
  params.selector = `[data-testid="${params.testid}"]`;
}
if (params.selector && typeof params.selector === 'string') {
  params.selector = resolveSelector(params.selector);
}
```

**Usage:**

- `testid` param: `{ action: 'click', params: { testid: 'btn' } }`
- Smart resolution: `{ action: 'click', params: { selector: 'btn' } }` → `[data-testid="btn"]`
- CSS selectors pass through: `.class`, `#id`, `[attr]`

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
