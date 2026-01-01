/**
 * Stdio JSON Protocol for puppet
 *
 * Accepts JSON commands via stdin, outputs JSON results to stdout.
 * One command per line, one result per line.
 */

import readline from 'readline';

import { startSession } from './session.js';
import type { SessionOptions, Command, Session } from './types.js';

export type StdioOptions = SessionOptions;

/**
 * Run puppet in stdio mode
 * Reads JSON commands from stdin, writes JSON results to stdout
 */
export async function runStdio(options: StdioOptions = {}): Promise<void> {
  // Initialize browser session
  const session: Session = await startSession(options);

  // Signal ready
  console.log(JSON.stringify({ ready: true }));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Command queue for sequential processing
  const commandQueue: string[] = [];
  let processing = false;

  async function processQueue(): Promise<void> {
    if (processing || commandQueue.length === 0) return;
    processing = true;

    while (commandQueue.length > 0) {
      const line = commandQueue.shift()!;
      try {
        const command = JSON.parse(line) as Omit<Command, 'id'>;
        const result = await session.command(command);
        console.log(JSON.stringify(result));
      } catch (error) {
        console.log(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }

    processing = false;
  }

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    commandQueue.push(trimmed);
    processQueue();
  });

  rl.on('close', async () => {
    // Wait for queue to finish
    while (processing || commandQueue.length > 0) {
      await new Promise(r => setTimeout(r, 10));
    }
    try {
      await session.close();
    } catch {
      // Ignore errors during cleanup
    }
    process.exit(0);
  });

  // Handle process signals for graceful shutdown
  process.on('SIGINT', async () => {
    try {
      await session.close();
    } catch {
      // Ignore errors during cleanup
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    try {
      await session.close();
    } catch {
      // Ignore errors during cleanup
    }
    process.exit(0);
  });
}
