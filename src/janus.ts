/**
 * Janus web tab integration
 *
 * Helpers to create and manage web tabs inside Janus (Electron app)
 * via its HTTP API, then connect to them via CDP for automation.
 */

import { puppet, Browser } from './fluent.js';
import type { SessionOptions } from './types.js';

const JANUS_API = 'http://localhost:9223';
const JANUS_CDP = 'http://localhost:9222';

/** Resolve windowId from explicit option or JANUS_WINDOW_ID env var */
function resolveWindowId(explicit?: number): number | undefined {
  if (explicit != null) return explicit;
  const env = process.env.JANUS_WINDOW_ID;
  if (env) return parseInt(env, 10);
  return undefined;
}

export interface JanusOptions extends Omit<SessionOptions, 'cdp'> {
  /** Janus HTTP API URL. Default: http://localhost:9223 */
  apiUrl?: string;
  /** Janus CDP URL. Default: http://localhost:9222 */
  cdpUrl?: string;
  /** URL to open in new web tab */
  url: string;
  /** Target Janus window ID. Auto-read from JANUS_WINDOW_ID env var if not set. */
  windowId?: number;
}

export interface JanusTab {
  id: number;
  url: string;
  title?: string;
}

/**
 * Create a Janus web tab and connect to it via CDP
 *
 * @example
 * ```typescript
 * const browser = await janusTab({ url: 'http://localhost:3000' });
 * await browser.click('login-btn');
 * await browser.close(); // disconnects CDP, doesn't close Janus
 * ```
 */
export async function janusTab(options: JanusOptions): Promise<Browser> {
  const apiUrl = options.apiUrl || JANUS_API;
  const cdpUrl = options.cdpUrl || JANUS_CDP;
  const windowId = resolveWindowId(options.windowId);

  // Create tab via Janus HTTP API
  const body: Record<string, unknown> = { url: options.url };
  if (windowId != null) body.windowId = windowId;

  const res = await fetch(`${apiUrl}/api/tabs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create Janus tab: ${res.status} ${res.statusText}`);
  }

  const { tabId } = await res.json();

  // Small delay to let the webview initialize and become discoverable via CDP
  await new Promise(r => setTimeout(r, 1000));

  // Connect via CDP, find the page by URL
  // Default showCursor to true since Janus panels are visible on screen
  const { apiUrl: _a, cdpUrl: _c, url: _u, windowId: _w, ...sessionOpts } = options;
  const browser = await puppet({
    ...sessionOpts,
    showCursor: sessionOpts.showCursor ?? true,
    cdp: cdpUrl,
    cdpPageUrl: options.url,
  });

  // Attach the Janus tab ID so callers can use janusCloseTab(browser.tabId)
  (browser as Browser & { tabId: number }).tabId = tabId;

  return browser;
}

/**
 * List all Janus web tabs
 */
export async function janusListTabs(apiUrl = JANUS_API, windowId?: number): Promise<JanusTab[]> {
  const wid = resolveWindowId(windowId);
  const url = wid != null ? `${apiUrl}/api/tabs?windowId=${wid}` : `${apiUrl}/api/tabs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to list Janus tabs: ${res.status} ${res.statusText}`);
  }
  const tabs: Array<{ tabId: number; url: string; title?: string }> = await res.json();
  return tabs.map(t => ({ id: t.tabId, url: t.url, title: t.title }));
}

/**
 * Close a Janus web tab
 */
export async function janusCloseTab(
  tabId: number,
  apiUrl = JANUS_API,
  windowId?: number
): Promise<void> {
  const wid = resolveWindowId(windowId);
  const body = wid != null ? JSON.stringify({ windowId: wid }) : undefined;
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${apiUrl}/api/tabs/${tabId}`, {
    method: 'DELETE',
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`Failed to close Janus tab ${tabId}: ${res.status} ${res.statusText}`);
  }
}

/**
 * Navigate an existing Janus web tab to a new URL
 */
export async function janusNavigateTab(
  tabId: number,
  url: string,
  apiUrl = JANUS_API,
  windowId?: number
): Promise<void> {
  const wid = resolveWindowId(windowId);
  const body: Record<string, unknown> = { url };
  if (wid != null) body.windowId = wid;

  const res = await fetch(`${apiUrl}/api/tabs/${tabId}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to navigate Janus tab ${tabId}: ${res.status} ${res.statusText}`);
  }
}
