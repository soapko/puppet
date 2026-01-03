/**
 * Tests for timeout forwarding fix
 *
 * Verifies that waitFor() and waitForLoaded() properly forward
 * their timeout parameter to sendCommand options.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the session module before importing fluent
vi.mock('../src/session.js', () => ({
  startSession: vi.fn().mockResolvedValue({
    isRunning: () => true,
    close: vi.fn(),
    restart: vi.fn(),
  }),
  sendCommand: vi.fn().mockResolvedValue({ id: 'test', success: true }),
}));

import { puppet } from '../src/fluent.js';
import { sendCommand } from '../src/session.js';

describe('Timeout Forwarding', () => {
  let browser: Awaited<ReturnType<typeof puppet>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    browser = await puppet();
  });

  afterEach(async () => {
    try {
      await browser.close();
    } catch {
      // Ignore close errors in tests
    }
  });

  describe('waitFor()', () => {
    test('forwards timeout to sendCommand with 1000ms buffer', async () => {
      const customTimeout = 30000;

      await browser.waitFor('[data-testid="test"]', customTimeout);

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitFor',
          params: expect.objectContaining({
            timeout: customTimeout,
          }),
        }),
        expect.objectContaining({
          timeout: customTimeout + 1000, // Should add 1000ms buffer
        })
      );
    });

    test('uses undefined sendCommand timeout when no timeout specified', async () => {
      await browser.waitFor('[data-testid="test"]');

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitFor',
        }),
        expect.objectContaining({
          timeout: undefined,
        })
      );
    });

    test('handles small timeout values correctly', async () => {
      const smallTimeout = 1000;

      await browser.waitFor('[data-testid="test"]', smallTimeout);

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitFor',
          params: expect.objectContaining({
            timeout: smallTimeout,
          }),
        }),
        expect.objectContaining({
          timeout: smallTimeout + 1000,
        })
      );
    });
  });

  describe('waitForLoaded()', () => {
    test('forwards timeout to sendCommand with 1000ms buffer', async () => {
      const customTimeout = 60000;

      await browser.waitForLoaded(customTimeout);

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitForLoaded',
          params: expect.objectContaining({
            timeout: customTimeout,
          }),
        }),
        expect.objectContaining({
          timeout: customTimeout + 1000, // Should add 1000ms buffer
        })
      );
    });

    test('uses undefined sendCommand timeout when no timeout specified', async () => {
      await browser.waitForLoaded();

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitForLoaded',
        }),
        expect.objectContaining({
          timeout: undefined,
        })
      );
    });

    test('handles large timeout values correctly', async () => {
      const largeTimeout = 120000; // 2 minutes

      await browser.waitForLoaded(largeTimeout);

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitForLoaded',
          params: expect.objectContaining({
            timeout: largeTimeout,
          }),
        }),
        expect.objectContaining({
          timeout: largeTimeout + 1000,
        })
      );
    });
  });

  describe('other methods', () => {
    test('click does not pass timeout by default', async () => {
      await browser.click('[data-testid="btn"]');

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'click',
        }),
        undefined
      );
    });

    test('goto does not pass timeout by default', async () => {
      await browser.goto('https://example.com');

      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'goto',
        }),
        undefined
      );
    });
  });
});
