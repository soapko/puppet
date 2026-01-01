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
