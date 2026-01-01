import type { RetryOptions } from './types.js';

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2,
};

// Simple logger for retry debugging
const log = {
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.PUPPET_DEBUG) console.log(`[puppet:retry] ${msg}`, ...args);
  },
};

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('No attempts made');
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxAttempts) {
        break;
      }

      log.debug(
        `Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms: ${lastError.message}`
      );

      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Parse retry parameter from command params
 */
export function parseRetryOptions(
  retryParam: number | RetryOptions | undefined
): RetryOptions | undefined {
  if (retryParam === undefined) {
    return undefined;
  }

  if (typeof retryParam === 'number') {
    return { maxAttempts: retryParam };
  }

  return retryParam;
}

/**
 * Execute a function with optional retry based on params
 */
export async function executeWithOptionalRetry<T>(
  fn: () => Promise<T>,
  retryParam: number | RetryOptions | undefined
): Promise<T> {
  const options = parseRetryOptions(retryParam);

  if (!options) {
    return fn();
  }

  return withRetry(fn, options);
}
