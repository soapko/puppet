/**
 * Test runner configuration
 */

export interface VideoConfig {
  /** Directory to save videos (default: './test-results/videos') */
  dir?: string;
  /** Video size - defaults to viewport size */
  size?: { width: number; height: number };
}

export interface PuppetTestConfig {
  /** Base URL for relative navigation (e.g., 'http://localhost:3000') */
  baseURL?: string;

  /** Run browser in headless mode (default: true) */
  headless?: boolean;

  /** Browser viewport size (default: 1440x900) */
  viewport?: { width: number; height: number };

  /** Slow down actions by this many milliseconds (useful for debugging) */
  slowMo?: number;

  /** Default timeout for actions in milliseconds (default: 30000) */
  timeout?: number;

  /** Take screenshot on test failure (default: true) */
  screenshotOnFailure?: boolean;

  /** Directory for failure screenshots (default: './test-results') */
  screenshotDir?: string;

  /** Enable video recording (automatically enables visual cursor) (default: false) */
  video?: boolean | VideoConfig;

  /** Directory for videos (default: './test-results/videos') */
  videoDir?: string;

  /** Show visual cursor overlay. Automatically enabled when video is true. Useful for debugging in headed mode. (default: false) */
  showCursor?: boolean;
}

const defaultConfig: Required<PuppetTestConfig> = {
  baseURL: '',
  headless: true,
  viewport: { width: 1440, height: 900 },
  slowMo: 0,
  timeout: 30000,
  screenshotOnFailure: true,
  screenshotDir: './test-results',
  video: false,
  videoDir: './test-results/videos',
  showCursor: false,
};

let currentConfig: Required<PuppetTestConfig> = { ...defaultConfig };

/**
 * Define test configuration
 *
 * @example
 * ```typescript
 * // puppet.config.ts
 * import { defineConfig } from 'puppet/test';
 *
 * export default defineConfig({
 *   baseURL: 'http://localhost:3000',
 *   headless: true,
 *   timeout: 30000,
 *   screenshotOnFailure: true,
 * });
 * ```
 */
export function defineConfig(config: PuppetTestConfig): PuppetTestConfig {
  currentConfig = { ...defaultConfig, ...config };
  return currentConfig;
}

/**
 * Get current configuration
 */
export function getConfig(): Required<PuppetTestConfig> {
  return currentConfig;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
}

/**
 * Resolve a URL against the baseURL
 */
export function resolveURL(url: string): string {
  if (!url) return url;

  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Relative URL with baseURL configured
  if (currentConfig.baseURL) {
    const base = currentConfig.baseURL.endsWith('/')
      ? currentConfig.baseURL.slice(0, -1)
      : currentConfig.baseURL;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }

  return url;
}
