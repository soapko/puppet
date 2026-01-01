#!/usr/bin/env node
/**
 * Puppet CLI
 *
 * Usage:
 *   puppet serve [options]    Start HTTP server mode
 *   puppet stdio [options]    Start stdio JSON protocol mode
 *   puppet --help             Show help
 *
 * Options:
 *   --port=PORT        HTTP server port (default: 3000)
 *   --host=HOST        HTTP server host (default: localhost)
 *   --headless         Run browser in headless mode
 *   --no-headless      Run browser with visible window (default)
 */

import { startRecording } from './recorder/index.js';
import { startRepl } from './repl.js';
import { serve } from './server.js';
import { runStdio } from './stdio.js';
import { serveWebSocket } from './websocket.js';

function printHelp() {
  console.log(`
Puppet CLI - Browser automation with human-like cursor movements

Usage:
  puppet serve [options]    Start HTTP server mode
  puppet stdio [options]    Start stdio JSON protocol mode
  puppet ws [options]       Start WebSocket server mode
  puppet repl               Start interactive REPL mode
  puppet record [options]   Record user interactions and generate test code

Options:
  --port=PORT        Server port (default: 3000 for HTTP, 3001 for WS)
  --host=HOST        Server host (default: localhost)
  --headless         Run browser in headless mode
  --no-headless      Run browser with visible window (default)
  --url=URL          Starting URL for record mode
  --output=FILE      Output file for generated test (record mode)
  --format=FORMAT    Output format: puppet (default) or playwright
  --help, -h         Show this help message

Examples:
  puppet serve                    Start HTTP server on port 3000
  puppet serve --port=8080        Start HTTP server on port 8080
  puppet serve --headless         Start with headless browser
  puppet ws                       Start WebSocket server on port 3001
  puppet ws --port=8080           Start WebSocket server on port 8080
  puppet stdio --headless         Start stdio mode headless
  puppet repl                     Start interactive REPL
  puppet record                   Start recording mode
  puppet record --url=https://example.com
  puppet record --url=https://example.com --output=tests/login.test.ts

Stdio Mode:
  Reads JSON commands from stdin, writes JSON results to stdout.
  One command per line, one result per line.

  Input:  {"action":"goto","params":{"url":"https://example.com"}}
  Output: {"ready":true}
          {"success":true,"result":{}}

HTTP Endpoints:
  POST /command     Execute any command (JSON body)
  GET  /goto        Navigate (url param)
  GET  /click       Click element (selector param)
  GET  /type        Type text (selector, text params)
  GET  /text        Get text content (selector param)
  GET  /screenshot  Take screenshot
  GET  /url         Get current URL
  GET  /title       Get page title
  GET  /health      Health check
  GET  /close       Close browser and server
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse options
  const getArg = (prefix: string): string | undefined => {
    const arg = args.find(a => a.startsWith(prefix));
    return arg?.split('=')[1];
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  if (hasFlag('--help') || hasFlag('-h') || !command) {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case 'serve': {
      const port = parseInt(getArg('--port=') || '3000', 10);
      const host = getArg('--host=') || 'localhost';
      const headless = hasFlag('--headless') && !hasFlag('--no-headless');

      await serve({ port, host, headless });
      break;
    }

    case 'stdio': {
      const headless = hasFlag('--headless') && !hasFlag('--no-headless');

      await runStdio({ headless });
      break;
    }

    case 'repl': {
      await startRepl();
      break;
    }

    case 'ws': {
      const port = parseInt(getArg('--port=') || '3001', 10);
      const host = getArg('--host=') || 'localhost';
      const headless = hasFlag('--headless') && !hasFlag('--no-headless');

      await serveWebSocket({ port, host, headless });
      break;
    }

    case 'record': {
      const url = getArg('--url=');
      const output = getArg('--output=');
      const format = (getArg('--format=') as 'puppet' | 'playwright') || 'puppet';

      await startRecording({ url, output, format });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "puppet --help" for usage information.');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
