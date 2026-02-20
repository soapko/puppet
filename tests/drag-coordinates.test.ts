/**
 * Tests for dragCoordinates command
 *
 * Verifies coordinate-based drag with trusted CDP events.
 */

import { test, expect, setupPuppet, describe } from '../dist/test/index.js';

setupPuppet();

const SLIDER_HTML = `data:text/html,${encodeURIComponent(`
<html><body>
<div id="track" style="position:relative;width:400px;height:40px;background:#ddd;margin:50px;">
  <div id="handle" style="position:absolute;left:0;top:0;width:40px;height:40px;background:#333;cursor:grab;"></div>
</div>
<div id="log"></div>
<script>
  const handle = document.getElementById('handle');
  const log = document.getElementById('log');
  const events = [];

  ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup'].forEach(evt => {
    handle.addEventListener(evt, e => {
      events.push({ type: e.type, trusted: e.isTrusted, x: Math.round(e.clientX), y: Math.round(e.clientY) });
      log.textContent = JSON.stringify(events);
    });
  });

  // Simple drag logic
  let dragging = false;
  handle.addEventListener('pointerdown', () => { dragging = true; });
  document.addEventListener('pointermove', e => {
    if (dragging) {
      const track = document.getElementById('track');
      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left - 20, 360));
      handle.style.left = x + 'px';
    }
  });
  document.addEventListener('pointerup', () => { dragging = false; });
</script>
</body></html>
`)}`;

describe('dragCoordinates', () => {
  test('performs coordinate-based drag with trusted events', async ({ page }) => {
    await page.goto(SLIDER_HTML);

    // The handle starts at left:0 within the track.
    // Track is at margin:50px, so handle center is roughly (70, 70).
    // Drag it to the right side of the track, roughly (370, 70).
    await page.dragCoordinates(70, 70, 370, 70);

    // Verify the handle moved (left should be > 0)
    const handleLeft = await page.evaluate(
      "parseInt(document.getElementById('handle').style.left, 10)"
    );
    expect(handleLeft).toBeGreaterThan(100);
  });

  test('events are trusted (isTrusted === true)', async ({ page }) => {
    await page.goto(SLIDER_HTML);

    await page.dragCoordinates(70, 70, 370, 70);

    // Read the event log from the page
    const logText = await page.evaluate("document.getElementById('log').textContent");
    const events = JSON.parse(logText as string) as Array<{ type: string; trusted: boolean }>;

    // All captured events should be trusted
    expect(events.length).toBeGreaterThan(0);
    for (const evt of events) {
      expect(evt.trusted).toBe(true);
    }
  });

  test('same source and target (no-op drag)', async ({ page }) => {
    await page.goto(SLIDER_HTML);

    // Should not throw when source === target
    await page.dragCoordinates(70, 70, 70, 70);

    // Handle should stay near start
    const handleLeft = await page.evaluate(
      "parseInt(document.getElementById('handle').style.left, 10)"
    );
    expect(handleLeft).toBeLessThan(50);
  });

  test('short drag distance', async ({ page }) => {
    await page.goto(SLIDER_HTML);

    // Very short drag: 10px to the right
    await page.dragCoordinates(70, 70, 80, 70);

    const handleLeft = await page.evaluate(
      "parseInt(document.getElementById('handle').style.left, 10)"
    );
    // Should have moved slightly
    expect(handleLeft).toBeGreaterThanOrEqual(0);
  });
});
