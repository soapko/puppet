# Current Implementation

Overview of implemented features and important implementation details.

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
