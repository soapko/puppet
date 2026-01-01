/**
 * Test what happens when browser process is killed externally
 */

import { startSession, sendCommand } from './dist/index.js';
import { execSync } from 'child_process';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== Testing Browser Process Kill ===\n');

  // Start session in headless mode for easier testing
  console.log('Starting session...');
  const session = await startSession({ headless: true });
  console.log('Session started');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Navigate somewhere to confirm it's working
  console.log('\nNavigating to example.com...');
  const gotoResult = await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });
  console.log('Goto result:', gotoResult.success ? 'success' : 'failed');

  // Get URL to confirm
  const urlResult = await sendCommand({ action: 'getUrl' });
  console.log('Current URL:', urlResult.result);

  // Find and kill the chromium process
  console.log('\n--- Killing Chromium process ---');
  try {
    // Find chromium processes launched by Playwright
    const pgrep = execSync('pgrep -f "chromium.*--headless"', { encoding: 'utf-8' }).trim();
    console.log('Found Chromium PIDs:', pgrep);

    // Kill them
    execSync(`pkill -9 -f "chromium.*--headless"`, { encoding: 'utf-8' });
    console.log('Killed Chromium processes');
  } catch (err) {
    console.log('Kill command result:', err.message);
  }

  // Wait for disconnect detection
  await sleep(1000);

  console.log('\nAfter killing browser:');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Try to send command after browser is killed
  console.log('\n--- Trying to send command after browser kill ---');
  try {
    const result = await sendCommand({ action: 'getUrl' }, { timeout: 5000 });
    console.log('getUrl result:', result);
  } catch (err) {
    console.log('getUrl error:', err.message);
  }

  // Check state again
  console.log('\nState after failed command:');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Try to restart
  console.log('\n--- Attempting restart ---');
  try {
    await session.restart();
    console.log('Restart succeeded');
    console.log(`isRunning: ${session.isRunning()}`);
    console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

    // Try a command after restart
    const gotoResult2 = await sendCommand({ action: 'goto', params: { url: 'https://example.org' } });
    console.log('Goto after restart:', gotoResult2.success ? 'success' : 'failed');

    const urlResult2 = await sendCommand({ action: 'getUrl' });
    console.log('URL after restart:', urlResult2.result);
  } catch (err) {
    console.log('Restart failed:', err.message);
  }

  // Cleanup
  console.log('\nCleaning up...');
  try {
    await session.close();
    console.log('Cleanup complete');
  } catch (err) {
    console.log('Cleanup error:', err.message);
  }

  console.log('\n=== Test Complete ===');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
