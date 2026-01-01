/**
 * Test script for session lifecycle and error recovery
 *
 * Tests:
 * 1. Session starts correctly
 * 2. isRunning() and isBrowserConnected() return true
 * 3. After browser close, isRunning() returns false
 * 4. restart() recovers the session
 * 5. Commands work after restart
 */

import { startSession, sendCommand } from './dist/index.js';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== Session Lifecycle Tests ===\n');

  // Test 1: Start session
  console.log('Test 1: Starting session...');
  const session = await startSession({ headless: true });
  console.log('  ✓ Session started');

  // Test 2: Check initial state
  console.log('\nTest 2: Checking initial state...');
  console.log(`  isRunning(): ${session.isRunning()}`);
  console.log(`  isBrowserConnected(): ${session.isBrowserConnected()}`);

  if (!session.isRunning() || !session.isBrowserConnected()) {
    console.log('  ✗ FAILED: Session should be running and connected');
    await session.close();
    process.exit(1);
  }
  console.log('  ✓ Session is running and connected');

  // Test 3: Send a command
  console.log('\nTest 3: Sending goto command...');
  const gotoResult = await sendCommand({
    action: 'goto',
    params: { url: 'https://example.com' },
  });
  console.log(`  Result: ${JSON.stringify(gotoResult)}`);

  if (!gotoResult.success) {
    console.log('  ✗ FAILED: goto command should succeed');
    await session.close();
    process.exit(1);
  }
  console.log('  ✓ Command succeeded');

  // Test 4: Get URL
  console.log('\nTest 4: Getting URL...');
  const urlResult = await sendCommand({ action: 'getUrl' });
  console.log(`  URL: ${urlResult.result}`);

  if (!urlResult.result.includes('example.com')) {
    console.log('  ✗ FAILED: URL should contain example.com');
    await session.close();
    process.exit(1);
  }
  console.log('  ✓ URL is correct');

  // Test 5: Close browser via close command
  console.log('\nTest 5: Closing browser via close command...');
  await sendCommand({ action: 'close' });
  await sleep(500); // Give it time to close

  console.log(`  isRunning(): ${session.isRunning()}`);
  console.log(`  isBrowserConnected(): ${session.isBrowserConnected()}`);

  if (session.isRunning()) {
    console.log('  ✗ FAILED: Session should not be running after close');
    process.exit(1);
  }
  console.log('  ✓ Session correctly reports not running');

  // Test 6: Restart session
  console.log('\nTest 6: Restarting session...');
  await session.restart();

  console.log(`  isRunning(): ${session.isRunning()}`);
  console.log(`  isBrowserConnected(): ${session.isBrowserConnected()}`);

  if (!session.isRunning() || !session.isBrowserConnected()) {
    console.log('  ✗ FAILED: Session should be running after restart');
    await session.close();
    process.exit(1);
  }
  console.log('  ✓ Session restarted successfully');

  // Test 7: Commands work after restart
  console.log('\nTest 7: Testing commands after restart...');
  const gotoResult2 = await sendCommand({
    action: 'goto',
    params: { url: 'https://example.org' },
  });

  if (!gotoResult2.success) {
    console.log('  ✗ FAILED: Command should work after restart');
    await session.close();
    process.exit(1);
  }

  const urlResult2 = await sendCommand({ action: 'getUrl' });
  console.log(`  URL: ${urlResult2.result}`);

  if (!urlResult2.result.includes('example.org')) {
    console.log('  ✗ FAILED: URL should be example.org after restart');
    await session.close();
    process.exit(1);
  }
  console.log('  ✓ Commands work after restart');

  // Cleanup
  console.log('\nCleaning up...');
  await session.close();

  console.log('\n=== All Tests Passed! ===');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
