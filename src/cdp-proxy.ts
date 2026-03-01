/**
 * CDP WebSocket proxy that rewrites webview targets as page targets.
 *
 * Playwright's connectOverCDP only discovers targets with type "page".
 * Electron webviews show up as type "webview" in CDP, so Playwright
 * ignores them. This proxy sits between Playwright and the real CDP
 * endpoint, rewriting "webview" → "page" in target discovery messages
 * so Playwright creates Page objects for them.
 */
import { createServer, type Server } from 'http';

import { WebSocketServer, WebSocket } from 'ws';

export interface CDPProxyOptions {
  /** Only rewrite webview targets matching this URL (substring). If unset, all webviews are rewritten. */
  filterUrl?: string;
}

export interface CDPProxy {
  /** Local proxy port */
  port: number;
  /** Proxy URL for connectOverCDP */
  url: string;
  /** Shut down the proxy */
  close(): void;
}

/**
 * Rewrite target types in CDP messages: "webview" → "page"
 */
function rewriteTargetTypes(msg: Record<string, unknown>, filterUrl?: string): void {
  // Target.getTargets response
  const result = msg.result as Record<string, unknown> | undefined;
  if (result?.targetInfos && Array.isArray(result.targetInfos)) {
    for (const t of result.targetInfos) {
      if (t.type === 'webview' && (!filterUrl || (t.url as string)?.includes(filterUrl))) {
        t.type = 'page';
      }
    }
  }

  // Target.targetCreated / targetInfoChanged / attachedToTarget events
  const params = msg.params as Record<string, unknown> | undefined;
  const targetInfo = params?.targetInfo as Record<string, unknown> | undefined;
  if (
    targetInfo?.type === 'webview' &&
    ['Target.targetCreated', 'Target.targetInfoChanged', 'Target.attachedToTarget'].includes(
      msg.method as string
    ) &&
    (!filterUrl || (targetInfo.url as string)?.includes(filterUrl))
  ) {
    targetInfo.type = 'page';
  }
}

/**
 * Start a CDP proxy that rewrites webview targets as page targets.
 *
 * @param cdpUrl - Real CDP endpoint (e.g. "http://localhost:9222")
 * @param options - Optional filtering
 * @returns Proxy info with port, url, and close()
 */
export async function startCDPProxy(
  cdpUrl: string,
  options: CDPProxyOptions = {}
): Promise<CDPProxy> {
  // Fetch the real browser WS URL
  const versionResp = await fetch(`${cdpUrl}/json/version`);
  const versionInfo = (await versionResp.json()) as Record<string, string>;
  const realBrowserWsUrl = versionInfo.webSocketDebuggerUrl;
  const realWsUrlObj = new URL(realBrowserWsUrl);

  return new Promise<CDPProxy>(resolve => {
    // HTTP server proxies /json endpoints
    const server: Server = createServer(async (req, res) => {
      const targetUrl = `${cdpUrl}${req.url}`;
      try {
        const resp = await fetch(targetUrl);
        let body = await resp.text();

        if (req.url?.startsWith('/json')) {
          try {
            const data = JSON.parse(body);
            if (Array.isArray(data)) {
              // /json or /json/list — rewrite webview types
              for (const target of data) {
                if (
                  target.type === 'webview' &&
                  (!options.filterUrl || target.url?.includes(options.filterUrl))
                ) {
                  target.type = 'page';
                }
              }
            } else if (data.webSocketDebuggerUrl) {
              // /json/version — rewrite WS URL to point to our proxy
              const proxyAddr = server.address() as { port: number };
              data.webSocketDebuggerUrl = data.webSocketDebuggerUrl
                .replace(realWsUrlObj.hostname, 'localhost')
                .replace(`:${realWsUrlObj.port || '9222'}`, `:${proxyAddr.port}`);
            }
            body = JSON.stringify(data);
          } catch {
            // Not JSON, pass through
          }
        }

        res.writeHead(resp.status, { 'Content-Type': 'application/json' });
        res.end(body);
      } catch (err) {
        res.writeHead(502);
        res.end(`CDP proxy error: ${(err as Error).message}`);
      }
    });

    // WebSocket server proxies CDP protocol messages
    const wss = new WebSocketServer({ server, perMessageDeflate: false });
    wss.on('connection', (clientWs: WebSocket, req) => {
      const realUrl = `ws://${realWsUrlObj.hostname}:${realWsUrlObj.port || 9222}${req.url}`;
      const serverWs = new WebSocket(realUrl, { perMessageDeflate: false });
      const pendingMessages: (string | Buffer)[] = [];
      let serverReady = false;

      serverWs.on('open', () => {
        serverReady = true;
        for (const msg of pendingMessages) {
          serverWs.send(msg);
        }
        pendingMessages.length = 0;
      });

      // Server → Client (rewrite target types)
      serverWs.on('message', (data: Buffer, isBinary: boolean) => {
        if (clientWs.readyState !== WebSocket.OPEN) return;
        if (isBinary) {
          clientWs.send(data, { binary: true });
          return;
        }
        const str = data.toString('utf-8');
        try {
          const msg = JSON.parse(str);
          rewriteTargetTypes(msg, options.filterUrl);
          clientWs.send(JSON.stringify(msg));
        } catch {
          clientWs.send(str);
        }
      });

      // Client → Server (forward as-is)
      clientWs.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary) {
          if (serverReady) serverWs.send(data, { binary: true });
          else pendingMessages.push(data);
          return;
        }
        const str = data.toString('utf-8');
        if (serverReady) {
          serverWs.send(str);
        } else {
          pendingMessages.push(str);
        }
      });

      clientWs.on('close', () => {
        if (serverWs.readyState === WebSocket.OPEN) serverWs.close();
      });
      serverWs.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      });
      clientWs.on('error', () => serverWs.close());
      serverWs.on('error', () => clientWs.close());
    });

    server.listen(0, 'localhost', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        url: `http://localhost:${port}`,
        close: () => {
          wss.close();
          server.close();
        },
      });
    });
  });
}
