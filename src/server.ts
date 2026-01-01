/**
 * HTTP server mode for puppet
 *
 * Provides a REST API for browser automation, enabling language-agnostic control.
 */

import http from 'http';

import { startSession, sendCommand } from './session.js';
import type { SessionOptions, Command, Session } from './types.js';

export interface ServerOptions extends SessionOptions {
  /** HTTP server port. Default: 3000 */
  port?: number;
  /** HTTP server host. Default: localhost */
  host?: string;
}

let activeSession: Session | null = null;

/**
 * Start an HTTP server that accepts browser automation commands
 */
export async function serve(options: ServerOptions = {}): Promise<http.Server> {
  const { port = 3000, host = 'localhost', ...sessionOptions } = options;

  // Start browser session
  console.log('[puppet:server] Starting browser session...');
  activeSession = await startSession(sessionOptions);
  console.log('[puppet:server] Browser session ready');

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const result = await handleRequest(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  // Handle server close to cleanup session
  server.on('close', async () => {
    if (activeSession) {
      console.log('[puppet:server] Closing browser session...');
      await activeSession.close();
      activeSession = null;
    }
  });

  return new Promise(resolve => {
    server.listen(port, host, () => {
      console.log(`[puppet:server] Server running at http://${host}:${port}`);
      console.log('[puppet:server] Endpoints:');
      console.log('  POST /command     - Execute any command (JSON body)');
      console.log('  GET  /goto        - Navigate (url param)');
      console.log('  GET  /click       - Click element (selector param)');
      console.log('  GET  /type        - Type text (selector, text params)');
      console.log('  GET  /text        - Get text content (selector param)');
      console.log('  GET  /screenshot  - Take screenshot (path param optional)');
      console.log('  GET  /url         - Get current URL');
      console.log('  GET  /title       - Get page title');
      console.log('  GET  /health      - Health check');
      console.log('  GET  /close       - Close browser and server');
      resolve(server);
    });
  });
}

class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function handleRequest(req: http.IncomingMessage) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // POST /command - Execute any command
  if (req.method === 'POST' && path === '/command') {
    const body = await readBody(req);
    if (!body.trim()) {
      throw new HttpError('Request body required', 400);
    }
    let command: Command;
    try {
      command = JSON.parse(body);
    } catch {
      throw new HttpError('Invalid JSON in request body', 400);
    }
    if (!command.action) {
      throw new HttpError('Command must have an action', 400);
    }
    // Generate ID if not provided
    if (!command.id) {
      command.id = `http-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return await sendCommand(command);
  }

  // GET shortcuts for common commands
  if (req.method === 'GET') {
    const params = Object.fromEntries(url.searchParams);

    switch (path) {
      case '/goto':
        if (!params.url) {
          throw new HttpError('url parameter required', 400);
        }
        return sendCommand({ action: 'goto', params: { url: params.url } });

      case '/click':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        return sendCommand({
          action: 'click',
          params: { selector: params.selector, testid: params.testid },
        });

      case '/type':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        if (!params.text) {
          throw new HttpError('text parameter required', 400);
        }
        return sendCommand({
          action: 'type',
          params: { selector: params.selector, testid: params.testid, text: params.text },
        });

      case '/text':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        return sendCommand({
          action: 'evaluate',
          params: {
            script: params.testid
              ? `document.querySelector('[data-testid="${params.testid}"]')?.textContent ?? ''`
              : `document.querySelector('${params.selector}')?.textContent ?? ''`,
          },
        });

      case '/value':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        return sendCommand({
          action: 'evaluate',
          params: {
            script: params.testid
              ? `document.querySelector('[data-testid="${params.testid}"]')?.value ?? ''`
              : `document.querySelector('${params.selector}')?.value ?? ''`,
          },
        });

      case '/screenshot':
        return sendCommand({
          action: 'screenshot',
          params: { path: params.path, fullPage: params.fullPage === 'true' },
        });

      case '/url':
        return sendCommand({ action: 'getUrl' });

      case '/title':
        return sendCommand({ action: 'getTitle' });

      case '/wait':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        return sendCommand({
          action: 'waitFor',
          params: {
            selector: params.selector,
            testid: params.testid,
            timeout: params.timeout ? parseInt(params.timeout, 10) : undefined,
          },
        });

      case '/waitForLoaded':
        return sendCommand({
          action: 'waitForLoaded',
          params: { timeout: params.timeout ? parseInt(params.timeout, 10) : undefined },
        });

      case '/clear':
        if (!params.selector && !params.testid) {
          throw new HttpError('selector or testid parameter required', 400);
        }
        return sendCommand({
          action: 'clear',
          params: { selector: params.selector, testid: params.testid },
        });

      case '/clearState':
        return sendCommand({
          action: 'clearState',
          params: { includeIndexedDB: params.includeIndexedDB === 'true' },
        });

      case '/health':
        return {
          status: 'ok',
          browserConnected: activeSession?.isBrowserConnected() ?? false,
          sessionRunning: activeSession?.isRunning() ?? false,
        };

      case '/close':
        // Schedule close after response
        setTimeout(async () => {
          if (activeSession) {
            await activeSession.close();
            activeSession = null;
          }
          process.exit(0);
        }, 100);
        return { success: true, message: 'Closing browser and server...' };

      default:
        throw new HttpError(`Unknown endpoint: ${path}`, 404);
    }
  }

  throw new HttpError(`Method not allowed: ${req.method} ${path}`, 405);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Stop the server and close the browser session
 */
export async function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) reject(err);
      else resolve();
    });
  });
}
