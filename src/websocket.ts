/**
 * WebSocket server mode for puppet
 *
 * Provides real-time, bidirectional browser control via WebSocket.
 */

import { WebSocketServer, WebSocket } from 'ws';

import { startSession } from './session.js';
import type { SessionOptions, Session } from './types.js';

export interface WebSocketServerOptions extends SessionOptions {
  /** WebSocket server port. Default: 3001 */
  port?: number;
  /** WebSocket server host. Default: localhost */
  host?: string;
}

interface ClientMessage {
  type: 'command';
  id: string;
  command: {
    action: string;
    params?: Record<string, unknown>;
  };
}

interface ServerMessage {
  type: 'ready' | 'result' | 'error';
  id?: string;
  success?: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Start a WebSocket server for browser automation
 */
export async function serveWebSocket(
  options: WebSocketServerOptions = {}
): Promise<WebSocketServer> {
  const { port = 3001, host = 'localhost', ...sessionOptions } = options;

  // Start browser session
  console.log('[puppet:ws] Starting browser session...');
  const session: Session = await startSession(sessionOptions);
  console.log('[puppet:ws] Browser session ready');

  const wss = new WebSocketServer({ port, host });

  console.log(`[puppet:ws] WebSocket server running at ws://${host}:${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('[puppet:ws] Client connected');

    // Send ready message
    const readyMsg: ServerMessage = { type: 'ready' };
    ws.send(JSON.stringify(readyMsg));

    ws.on('message', async (data: Buffer) => {
      let message: ClientMessage;

      try {
        message = JSON.parse(data.toString());
      } catch {
        const errorMsg: ServerMessage = {
          type: 'error',
          error: 'Invalid JSON',
        };
        ws.send(JSON.stringify(errorMsg));
        return;
      }

      if (message.type === 'command') {
        try {
          const result = await session.command({
            action: message.command.action as never,
            params: message.command.params,
          });

          const resultMsg: ServerMessage = {
            type: 'result',
            id: message.id,
            success: result.success,
            result: result.result,
            error: result.error,
          };
          ws.send(JSON.stringify(resultMsg));
        } catch (error) {
          const errorMsg: ServerMessage = {
            type: 'error',
            id: message.id,
            error: error instanceof Error ? error.message : String(error),
          };
          ws.send(JSON.stringify(errorMsg));
        }
      }
    });

    ws.on('close', () => {
      console.log('[puppet:ws] Client disconnected');
    });

    ws.on('error', (error: Error) => {
      console.error('[puppet:ws] WebSocket error:', error.message);
    });
  });

  // Handle server close to cleanup session
  wss.on('close', async () => {
    console.log('[puppet:ws] Closing browser session...');
    await session.close();
  });

  // Handle process signals for graceful shutdown
  const cleanup = async () => {
    console.log('[puppet:ws] Shutting down...');
    wss.close();
    await session.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return wss;
}

/**
 * Stop the WebSocket server
 */
export function stopWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    wss.close(err => {
      if (err) reject(err);
      else resolve();
    });
  });
}
