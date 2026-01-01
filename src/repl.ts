/**
 * Interactive REPL for exploring and debugging browser automation
 */

import readline from 'readline';

import { resolveSelector } from './selectors.js';
import { startSession, sendCommand } from './session.js';
import type { SessionOptions } from './types.js';

export interface ReplOptions extends SessionOptions {
  /** Welcome message shown on start */
  welcome?: boolean;
}

/**
 * Start the interactive REPL
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const { welcome = true, ...sessionOptions } = options;

  if (welcome) {
    console.log('Starting Puppet REPL...');
  }

  await startSession({ ...sessionOptions, headless: false });

  if (welcome) {
    console.log('Browser ready. Type "help" for commands.\n');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'puppet> ',
    historySize: 100,
  });

  rl.prompt();

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      const result = await executeReplCommand(trimmed);
      if (result !== undefined && result !== null) {
        console.log(result);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\nClosing browser...');
    try {
      await sendCommand({ action: 'close' });
    } catch {
      // Browser may already be closed
    }
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    rl.close();
  });
}

/**
 * Parse command arguments, respecting quoted strings
 */
function parseArgs(str: string): string[] {
  const args: string[] = [];
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match;
  while ((match = regex.exec(str))) {
    args.push(match[1] || match[2] || match[3]);
  }
  return args;
}

/**
 * Execute a REPL command
 */
async function executeReplCommand(input: string): Promise<unknown> {
  // Parse command and arguments
  const parts = input.match(/^(\w+)(?:\s+(.*))?$/);
  if (!parts) {
    throw new Error('Invalid command format. Type "help" for usage.');
  }

  const [, command, argsStr] = parts;
  const args = argsStr ? parseArgs(argsStr) : [];

  switch (command.toLowerCase()) {
    case 'help':
    case 'h':
    case '?':
      return printHelp();

    case 'goto':
    case 'go':
    case 'nav': {
      if (!args[0]) throw new Error('Usage: goto <url>');
      await sendCommand({ action: 'goto', params: { url: args[0] } });
      return `Navigated to ${args[0]}`;
    }

    case 'click':
    case 'c': {
      if (!args[0]) throw new Error('Usage: click <selector>');
      await sendCommand({ action: 'click', params: { selector: resolveSelector(args[0]) } });
      return `Clicked ${args[0]}`;
    }

    case 'type':
    case 't': {
      if (!args[0] || args.length < 2) throw new Error('Usage: type <selector> <text>');
      const text = args.slice(1).join(' ');
      await sendCommand({
        action: 'type',
        params: { selector: resolveSelector(args[0]), text },
      });
      return `Typed "${text}" into ${args[0]}`;
    }

    case 'clear': {
      if (args[0]) {
        // Clear specific input
        await sendCommand({ action: 'clear', params: { selector: resolveSelector(args[0]) } });
        return `Cleared ${args[0]}`;
      } else {
        // Clear state (cookies, storage)
        await sendCommand({ action: 'clearState', params: {} });
        return 'Cleared cookies and storage';
      }
    }

    case 'text': {
      if (!args[0]) throw new Error('Usage: text <selector>');
      const result = await sendCommand({
        action: 'evaluate',
        params: {
          script: `document.querySelector('${resolveSelector(args[0])}')?.textContent ?? ''`,
        },
      });
      return result.result;
    }

    case 'value':
    case 'val': {
      if (!args[0]) throw new Error('Usage: value <selector>');
      const result = await sendCommand({
        action: 'evaluate',
        params: { script: `document.querySelector('${resolveSelector(args[0])}')?.value ?? ''` },
      });
      return result.result;
    }

    case 'html': {
      if (args[0]) {
        const result = await sendCommand({
          action: 'evaluate',
          params: {
            script: `document.querySelector('${resolveSelector(args[0])}')?.outerHTML ?? ''`,
          },
        });
        return result.result;
      } else {
        const result = await sendCommand({
          action: 'evaluate',
          params: { script: 'document.documentElement.outerHTML' },
        });
        return result.result;
      }
    }

    case 'screenshot':
    case 'ss': {
      const result = await sendCommand({
        action: 'screenshot',
        params: args[0] ? { path: args[0] } : {},
      });
      return args[0]
        ? `Screenshot saved: ${args[0]}`
        : `Screenshot: ${(result.result as string).slice(0, 50)}...`;
    }

    case 'url': {
      const result = await sendCommand({ action: 'getUrl', params: {} });
      return result.result;
    }

    case 'title': {
      const result = await sendCommand({ action: 'getTitle', params: {} });
      return result.result;
    }

    case 'eval':
    case 'js': {
      if (!args.length) throw new Error('Usage: eval <javascript>');
      const script = args.join(' ');
      const result = await sendCommand({ action: 'evaluate', params: { script } });
      return result.result;
    }

    case 'wait':
    case 'sleep': {
      const ms = parseInt(args[0]) || 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
      return `Waited ${ms}ms`;
    }

    case 'waitfor':
    case 'wf': {
      if (!args[0]) throw new Error('Usage: waitfor <selector>');
      const timeout = args[1] ? parseInt(args[1]) : undefined;
      await sendCommand({
        action: 'waitFor',
        params: { selector: resolveSelector(args[0]), ...(timeout && { timeout }) },
      });
      return `Found ${args[0]}`;
    }

    case 'waitloaded':
    case 'wl': {
      const timeout = args[0] ? parseInt(args[0]) : undefined;
      await sendCommand({
        action: 'waitForLoaded',
        params: timeout ? { timeout } : {},
      });
      return 'Page loaded';
    }

    case 'hover': {
      if (!args[0]) throw new Error('Usage: hover <selector>');
      await sendCommand({
        action: 'evaluate',
        params: {
          script: `document.querySelector('${resolveSelector(args[0])}')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`,
        },
      });
      return `Hovered ${args[0]}`;
    }

    case 'scroll': {
      const direction = args[0] === 'up' ? 'up' : 'down';
      const amount = parseInt(args[1]) || 300;
      await sendCommand({ action: 'scroll', params: { direction, amount } });
      return `Scrolled ${direction} ${amount}px`;
    }

    case 'check': {
      if (!args[0]) throw new Error('Usage: check <selector>');
      await sendCommand({
        action: 'evaluate',
        params: {
          script: `const el = document.querySelector('${resolveSelector(args[0])}'); if (!el.checked) el.click()`,
        },
      });
      return `Checked ${args[0]}`;
    }

    case 'uncheck': {
      if (!args[0]) throw new Error('Usage: uncheck <selector>');
      await sendCommand({
        action: 'evaluate',
        params: {
          script: `const el = document.querySelector('${resolveSelector(args[0])}'); if (el.checked) el.click()`,
        },
      });
      return `Unchecked ${args[0]}`;
    }

    case 'select': {
      if (!args[0] || !args[1]) throw new Error('Usage: select <selector> <value>');
      const sel = resolveSelector(args[0]);
      await sendCommand({
        action: 'evaluate',
        params: {
          script: `document.querySelector('${sel}').value = '${args[1]}'; document.querySelector('${sel}').dispatchEvent(new Event('change', { bubbles: true }))`,
        },
      });
      return `Selected "${args[1]}" in ${args[0]}`;
    }

    case 'frame': {
      if (!args[0]) throw new Error('Usage: frame <selector>');
      await sendCommand({
        action: 'switchToFrame',
        params: { selector: resolveSelector(args[0]) },
      });
      return `Switched to frame ${args[0]}`;
    }

    case 'mainframe':
    case 'main': {
      await sendCommand({ action: 'switchToMain', params: {} });
      return 'Switched to main frame';
    }

    case 'reload':
    case 'refresh': {
      await sendCommand({ action: 'evaluate', params: { script: 'location.reload()' } });
      return 'Page reloaded';
    }

    case 'back': {
      await sendCommand({ action: 'evaluate', params: { script: 'history.back()' } });
      return 'Navigated back';
    }

    case 'forward': {
      await sendCommand({ action: 'evaluate', params: { script: 'history.forward()' } });
      return 'Navigated forward';
    }

    case 'exit':
    case 'quit':
    case 'q': {
      process.emit('SIGINT' as NodeJS.Signals);
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}. Type "help" for available commands.`);
  }
}

/**
 * Print help message
 */
function printHelp(): string {
  return `
Puppet REPL - Interactive Browser Automation

NAVIGATION
  goto <url>              Navigate to URL (aliases: go, nav)
  back                    Go back in history
  forward                 Go forward in history
  reload                  Reload page (alias: refresh)

INTERACTION
  click <sel>             Click element (alias: c)
  type <sel> <text>       Type text into element (alias: t)
  clear [sel]             Clear input, or cookies/storage if no selector
  hover <sel>             Hover over element
  scroll [up|down] [px]   Scroll page (default: down 300px)
  check <sel>             Check checkbox
  uncheck <sel>           Uncheck checkbox
  select <sel> <value>    Select dropdown option

INSPECTION
  text <sel>              Get element text content
  value <sel>             Get input value (alias: val)
  html [sel]              Get HTML (element or full page)
  url                     Get current URL
  title                   Get page title
  screenshot [path]       Take screenshot (alias: ss)

JAVASCRIPT
  eval <code>             Execute JavaScript (alias: js)

WAITING
  wait [ms]               Wait milliseconds (default: 1000, alias: sleep)
  waitfor <sel> [ms]      Wait for element (alias: wf)
  waitloaded [ms]         Wait for page load (alias: wl)

FRAMES
  frame <sel>             Switch to iframe
  mainframe               Switch to main frame (alias: main)

OTHER
  help                    Show this help (aliases: h, ?)
  exit                    Close browser and exit (aliases: quit, q)

SELECTORS
  submit-btn              → [data-testid="submit-btn"]
  #id                     → #id (CSS ID)
  .class                  → .class (CSS class)
  [attr=val]              → [attr=val] (attribute)
  button                  → button (HTML tag)

EXAMPLES
  goto https://example.com
  click login-btn
  type email-input "user@test.com"
  text welcome-message
  screenshot ./debug.png
  eval document.title
`.trim();
}
