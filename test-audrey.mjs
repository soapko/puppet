import { getBrowser, createCursor } from './dist/index.js';

async function testAudreyAdmin() {
  console.log('Launching browser...');
  const { browser, page } = await getBrowser({ headless: false });
  const cursor = createCursor(page);

  try {
    // Navigate to WordPress admin
    console.log('Navigating to WordPress admin...');
    await page.goto('http://audrey-dev.local/wp-admin/');
    await cursor.wait(1000, 2000);

    // Check if we're on login page
    const url = page.url();
    console.log('Current URL:', url);

    if (url.includes('wp-login')) {
      console.log('On login page, logging in...');
      await cursor.type('#user_login', 'admin');
      await cursor.wait(300, 500);
      await cursor.type('#user_pass', 'admin');
      await cursor.wait(300, 500);
      await cursor.click('#wp-submit');
      await page.waitForURL('**/wp-admin/**', { timeout: 10000 });
      console.log('Logged in! URL:', page.url());
    }

    await cursor.wait(1000, 1500);

    // Click on Audrey menu
    console.log('\n=== Testing Audrey Dashboard ===');
    await cursor.click('#toplevel_page_audrey .wp-menu-name');
    await cursor.wait(1500, 2000);
    await page.screenshot({ path: '/tmp/audrey-1-dashboard.png', fullPage: true });
    console.log('Screenshot: /tmp/audrey-1-dashboard.png');
    console.log('Page title:', await page.title());

    // Look for submenu items and test each
    const submenus = await page.$$eval('#toplevel_page_audrey .wp-submenu li:not(.wp-submenu-head) a',
      links => links.map(a => ({ text: a.textContent.trim(), href: a.href }))
    );
    console.log('Audrey submenus:', submenus.map(s => s.text).join(', '));

    // Test Queue page
    console.log('\n=== Testing Action Queue ===');
    const queueLink = submenus.find(s => s.text.toLowerCase().includes('queue'));
    if (queueLink) {
      await page.goto(queueLink.href);
      await cursor.wait(1500, 2000);
      await page.screenshot({ path: '/tmp/audrey-2-queue.png', fullPage: true });
      console.log('Screenshot: /tmp/audrey-2-queue.png');
    }

    // Test Settings page
    console.log('\n=== Testing Settings ===');
    const settingsLink = submenus.find(s => s.text.toLowerCase().includes('settings'));
    if (settingsLink) {
      await page.goto(settingsLink.href);
      await cursor.wait(1500, 2000);
      await page.screenshot({ path: '/tmp/audrey-3-settings.png', fullPage: true });
      console.log('Screenshot: /tmp/audrey-3-settings.png');
    }

    // Test Community Profile page
    console.log('\n=== Testing Community Profile ===');
    const profileLink = submenus.find(s => s.text.toLowerCase().includes('community') || s.text.toLowerCase().includes('profile'));
    if (profileLink) {
      await page.goto(profileLink.href);
      await cursor.wait(1500, 2000);
      await page.screenshot({ path: '/tmp/audrey-4-community-profile.png', fullPage: true });
      console.log('Screenshot: /tmp/audrey-4-community-profile.png');
    }

    // Test Content Planner page
    console.log('\n=== Testing Content Planner ===');
    const plannerLink = submenus.find(s => s.text.toLowerCase().includes('content') || s.text.toLowerCase().includes('planner'));
    if (plannerLink) {
      await page.goto(plannerLink.href);
      await cursor.wait(1500, 2000);
      await page.screenshot({ path: '/tmp/audrey-5-content-planner.png', fullPage: true });
      console.log('Screenshot: /tmp/audrey-5-content-planner.png');
    }

    console.log('\n=== Testing Complete ===');
    console.log('Screenshots saved to /tmp/audrey-*.png');
    console.log('Browser will stay open for manual inspection. Press Ctrl+C to close.');

    // Keep browser open
    await new Promise(() => {});

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: '/tmp/audrey-error.png' });
    await browser.close();
    process.exit(1);
  }
}

testAudreyAdmin();
