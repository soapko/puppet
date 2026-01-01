# ADR 0001: Session Lifecycle API

**Date:** 2026-01-01
**Status:** Accepted

## Context

When using puppet for E2E testing, the browser window can get closed unexpectedly (by test code, user interaction, or crash). This causes all subsequent tests to fail because:

1. The session doesn't detect browser disconnection
2. Commands continue using stale `page`/`browser` references
3. `isRunning()` returns true even when browser is dead
4. No way to recover without restarting the entire test process

## Decision

Extend the Session interface with two new methods:

```typescript
export interface Session {
  close(): Promise<void>;
  getUrl(): string;
  isRunning(): boolean;
  isBrowserConnected(): boolean; // NEW
  restart(): Promise<void>; // NEW
}
```

### `isBrowserConnected(): boolean`

Returns whether the browser is still connected. Unlike `isRunning()`, this specifically checks browser connection state.

### `restart(): Promise<void>`

Closes the current browser (if connected), launches a new one, and reattaches all event listeners. Allows recovery from browser death without recreating the session object.

### Behavior Changes

- `isRunning()` now returns `running && browserConnected` (was just `running`)
- Commands fail fast with clear error if browser is disconnected

## Consequences

### Positive

- Tests can detect and recover from browser crashes
- Clear error messages when browser is dead
- No need to recreate session object to recover

### Negative

- API change requires updating existing code that relies on `isRunning()` always being true after `startSession()`
- `restart()` resets all state including dialog handling preferences

### Migration

Existing code that only uses `isRunning()` to check if session was explicitly closed will need no changes. The new behavior is additive—sessions that worked before will continue to work, but now with better error detection.
