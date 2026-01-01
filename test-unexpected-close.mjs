/**
 * Test what happens when browser is closed unexpectedly
 * (not via the close command, but externally)
 */

import { startSession, sendCommand } from './dist/index.js';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== Testing Unexpected Browser Close ===\n');

  // Start session (headless: false so we can see what happens)
  console.log('Starting session (visible browser)...');
  const session = await startSession({ headless: false });
  console.log('Session started');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Navigate somewhere
  console.log('\nNavigating to example.com...');
  await sendCommand({ action: 'goto', params: { url: 'https://example.com' } });
  console.log('Navigation complete');

  // Now we'll try to close the browser via JavaScript (simulating external close)
  console.log('\n--- Attempting to close browser via window.close() ---');
  console.log('(This simulates the browser being closed unexpectedly)\n');

  try {
    // This might not work due to browser security, but let's try
    const result = await sendCommand({
      action: 'evaluate',
      params: { script: 'window.close()' }
    }, { timeout: 5000 });
    console.log('window.close() result:', result);
  } catch (err) {
    console.log('window.close() error:', err.message);
  }

  await sleep(1000);

  console.log('\nAfter window.close() attempt:');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Try to send another command
  console.log('\n--- Trying to send command after close attempt ---');
  try {
    const result = await sendCommand({ action: 'getUrl' }, { timeout: 5000 });
    console.log('getUrl result:', result);
  } catch (err) {
    console.log('getUrl error:', err.message);
  }

  console.log('\nFinal state:');
  console.log(`isRunning: ${session.isRunning()}`);
  console.log(`isBrowserConnected: ${session.isBrowserConnected()}`);

  // Cleanup
  console.log('\nCleaning up...');
  try {
    await session.close();
  } catch (err) {
    console.log('Cleanup error (expected if browser already closed):', err.message);
  }

  console.log('\n=== Test Complete ===');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
