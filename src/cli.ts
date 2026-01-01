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

import { serve } from './server.js';
import { runStdio } from './stdio.js';

function printHelp() {
  console.log(`
Puppet CLI - Browser automation with human-like cursor movements

Usage:
  puppet serve [options]    Start HTTP server mode
  puppet stdio [options]    Start stdio JSON protocol mode

Options:
  --port=PORT        HTTP server port (default: 3000)
  --host=HOST        HTTP server host (default: localhost)
  --headless         Run browser in headless mode
  --no-headless      Run browser with visible window (default)
  --help, -h         Show this help message

Examples:
  puppet serve                    Start server on port 3000
  puppet serve --port=8080        Start server on port 8080
  puppet serve --headless         Start with headless browser
  puppet stdio --headless         Start stdio mode headless

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
