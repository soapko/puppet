/**
 * Direct CDP session via raw WebSocket to a specific target.
 *
 * Bypasses Playwright's browser-level session multiplexing, which doesn't
 * forward domain events (e.g. Page.screencastFrame) for Electron webview
 * targets. By connecting directly to the target's own WS URL, all events
 * flow correctly.
 */

import { EventEmitter } from 'events';

import { WebSocket } from 'ws';

const log = {
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.error(`[puppet:direct-cdp] ${msg}`, ...args);
  },
};

/** Minimal CDP session interface matching what CDPScreenRecorder needs */
export interface CDPSessionLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler: (...args: any[]) => void): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  detach(): Promise<void>;
}

/**
 * CDP session connected directly to a target's WebSocket URL.
 * Implements CDPSessionLike so it can be used as a drop-in replacement
 * for Playwright's CDPSession where direct event delivery is needed.
 */
export class DirectCDPSession extends EventEmitter implements CDPSessionLike {
  private ws: WebSocket;
  private nextId = 1;
  private callbacks = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private ready: Promise<void>;
  private _closed = false;
  private closeListeners: Array<() => void> = [];

  constructor(wsUrl: string) {
    super();
    log.debug(`Connecting directly to target: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl, { perMessageDeflate: false });

    this.ready = new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => {
        log.debug('Direct CDP session connected');
        resolve();
      });
      this.ws.once('error', (err: Error) => {
        reject(new Error(`Direct CDP connection failed: ${err.message}`));
      });
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          id?: number;
          method?: string;
          params?: unknown;
          result?: unknown;
          error?: { message: string };
        };

        if (msg.id !== undefined) {
          // Response to a command
          const cb = this.callbacks.get(msg.id);
          if (cb) {
            this.callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error.message));
            else cb.resolve(msg.result ?? {});
          }
        } else if (msg.method) {
          // Domain event (e.g. Page.screencastFrame)
          this.emit(msg.method, msg.params);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      log.debug('Direct CDP session closed');
      this._closed = true;
      // Reject any pending callbacks
      for (const [id, cb] of this.callbacks) {
        cb.reject(new Error('CDP session closed'));
        this.callbacks.delete(id);
      }
      // Notify close listeners
      for (const listener of this.closeListeners) {
        listener();
      }
    });

    this.ws.on('error', () => {
      // Swallow — close event handles cleanup
    });
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    await this.ready;
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP session is not open'));
        return;
      }
      const id = this.nextId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async detach(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }

  /** Register a callback for when the WebSocket closes */
  onClose(listener: () => void): void {
    if (this._closed) {
      listener(); // Already closed — fire immediately
    } else {
      this.closeListeners.push(listener);
    }
  }

  /** Whether the WebSocket connection has been closed */
  isClosed(): boolean {
    return this._closed;
  }
}

/** Target info from CDP /json/list endpoint */
interface CDPTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * Get a direct CDP session for a specific target, matched by page URL.
 * Fetches /json/list from the CDP endpoint and finds the target whose URL
 * contains the given substring.
 *
 * @param cdpUrl - CDP HTTP endpoint (e.g. "http://localhost:9222")
 * @param pageUrl - URL substring to match against target URLs
 * @returns DirectCDPSession connected to the matching target, or null if not found
 */
export async function getDirectCDPSession(
  cdpUrl: string,
  pageUrl: string
): Promise<DirectCDPSession | null> {
  const resp = await fetch(`${cdpUrl}/json/list`);
  const targets = (await resp.json()) as CDPTarget[];

  // Find matching target — prefer webview type, fall back to page type
  const match =
    targets.find(t => t.type === 'webview' && t.url.includes(pageUrl)) ||
    targets.find(t => t.type === 'page' && t.url.includes(pageUrl));

  if (!match?.webSocketDebuggerUrl) {
    log.debug(`No matching target found for URL: ${pageUrl}`);
    log.debug(
      `Available targets: ${JSON.stringify(targets.map(t => ({ type: t.type, url: t.url })))}`
    );
    return null;
  }

  log.debug(`Found target ${match.id} (${match.type}) for URL: ${pageUrl}`);
  const session = new DirectCDPSession(match.webSocketDebuggerUrl);
  // Wait for connection
  await session.send('Page.enable');
  return session;
}
