import { startSession } from './dist/index.js';

// Catch unhandled errors so process doesn't die silently
process.on('unhandledRejection', (err) => {
  console.error('[puppet] Unhandled rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[puppet] Uncaught exception:', err);
  process.exit(1);
});

try {
  console.log('[puppet] Starting session...');
  const session = await startSession();
  console.log('[puppet] Session running. Watching ~/.puppet/commands.json');
  console.log('[puppet] Send commands by writing to the file, read results from ~/.puppet/results.json');
  console.log('[puppet] Press Ctrl+C to stop');

  process.on('SIGINT', async () => {
    console.log('\n[puppet] Shutting down...');
    await session.close();
    console.log('[puppet] Session closed');
    process.exit(0);
  });

  // Keep alive
  setInterval(() => {}, 1000);
} catch (err) {
  console.error('[puppet] Failed to start session:', err);
  process.exit(1);
}
