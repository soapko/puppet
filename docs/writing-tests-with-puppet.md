# Writing Tests with Puppet

A guide for writing reliable, maintainable browser tests using puppet.

---

## Quick Start

```typescript
import { test, expect, setupPuppet } from 'puppet/test';

setupPuppet();

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.type('email', 'user@example.com');
  await page.type('password', 'secret123');
  await page.click('submit');

  await expect(page).toHaveURL('/dashboard');
  await expect(page).toHaveText('welcome', 'Hello, User');
});
```

---

## Test Structure

### Setup and Teardown

```typescript
import { test, expect, setupPuppet, describe, beforeEach } from 'puppet/test';

setupPuppet(); // Handles browser cleanup

describe('checkout flow', () => {
  beforeEach(async ({ page }) => {
    // Clear state between tests
    await page.clearState();
    await page.goto('/');
  });

  test('can add item to cart', async ({ page }) => {
    // ...
  });
});
```

### Test Isolation

Each test should be independent. Use `clearState()` to reset:

```typescript
await page.clearState(); // Clears cookies, localStorage, sessionStorage
await page.clearState({ includeIndexedDB: true }); // Also clears IndexedDB
```

---

## Selectors

### Smart Selector Resolution

Puppet automatically resolves bare strings to `data-testid` selectors:

```typescript
// These are equivalent:
await page.click('submit-btn');
await page.click('[data-testid="submit-btn"]');

// CSS selectors pass through unchanged:
await page.click('#login'); // ID
await page.click('.btn-primary'); // Class
await page.click('[name="email"]'); // Attribute
await page.click('button'); // HTML tag
```

### Selector Priority

When writing selectors, prefer in this order:

1. **data-testid** (most stable, decoupled from styling)
2. **Semantic HTML** (`button`, `input[type="submit"]`)
3. **ARIA attributes** (`[aria-label="Close"]`)
4. **CSS classes** (only if stable, not generated)

### Avoid

```typescript
// Bad - fragile selectors
await page.click('.sc-bdfBwQ'); // Generated class names
await page.click('div > div > button'); // Structural coupling
await page.click(':contains("Submit")'); // Content-based (i18n breaks)
```

---

## Waiting Strategies

### Wait for Elements

```typescript
// Wait for element to appear
await page.waitFor('modal-dialog');
await page.waitFor('modal-dialog', 10000); // With custom timeout

// Wait for element then interact
await page.waitFor('submit-btn');
await page.click('submit-btn');
```

### Wait for Loading States

Puppet's `waitForLoaded()` waits for common loading indicators to disappear:

```typescript
await page.goto('/dashboard');
await page.waitForLoaded(); // Waits for spinners, skeletons, etc.

// What it checks for:
// - [data-loading="true"]
// - [aria-busy="true"]
// - [data-testid*="loading"], [data-testid*="spinner"], [data-testid*="skeleton"]
// - .loading, .spinner, .skeleton, .loading-indicator, .loading-overlay
```

Custom loading selectors:

```typescript
await page.waitForLoaded({
  selectors: ['[data-testid="custom-loader"]'],
  timeout: 5000,
  waitForNetwork: false, // Skip network idle check
});
```

### Avoid Fixed Waits

```typescript
// Bad - arbitrary delay
await page.wait(2000);
await page.click('submit');

// Good - wait for condition
await page.waitFor('submit');
await page.click('submit');
```

---

## Assertions

### Element Assertions

```typescript
// Visibility
await expect(page).toBeVisible('login-form');
await expect(page).toBeHidden('loading-spinner');

// Text content
await expect(page).toHaveText('heading', 'Welcome'); // Contains
await page.assertText('heading', 'Welcome', true); // Exact match

// Form state
await expect(page).toHaveValue('email', 'test@example.com');
await expect(page).toBeChecked('remember-me');
await expect(page).toBeEnabled('submit');
await expect(page).toBeDisabled('locked-field');

// Element count
await expect(page).toHaveCount('cart-item', 3);
```

### Page Assertions

```typescript
// URL
await expect(page).toHaveURL('/dashboard'); // Contains
await page.assertUrl('https://example.com/dashboard', true); // Exact

// Title
await expect(page).toHaveTitle('Dashboard');
```

### Fluent API Assertions

When using the fluent API directly (not Vitest integration):

```typescript
import { withBrowser } from 'puppet';

await withBrowser(async browser => {
  await browser.goto('/login');

  // Built-in assertions throw on failure
  await browser.assertVisible('login-form');
  await browser.assertText('heading', 'Sign In');
  await browser.assertEnabled('submit-btn');
});
```

---

## Common Patterns

### Form Submission

```typescript
test('form submission', async ({ page }) => {
  await page.goto('/contact');

  // Fill form
  await page.type('name', 'John Doe');
  await page.type('email', 'john@example.com');
  await page.type('message', 'Hello!');
  await page.select('topic', 'support');
  await page.check('agree-terms');

  // Submit and verify
  await page.click('submit');
  await page.waitForLoaded();

  await expect(page).toHaveURL('/contact/success');
  await expect(page).toHaveText('confirmation', 'Thank you');
});
```

### Authentication Flow

```typescript
// Helper function
async function login(page, email, password) {
  await page.goto('/login');
  await page.type('email', email);
  await page.type('password', password);
  await page.click('submit');
  await page.waitForLoaded();
}

test('authenticated user can access dashboard', async ({ page }) => {
  await login(page, 'user@example.com', 'password123');

  await expect(page).toHaveURL('/dashboard');
  await expect(page).toBeVisible('user-menu');
});
```

### Modal/Dialog Handling

```typescript
test('confirm deletion modal', async ({ page }) => {
  await page.goto('/items/123');
  await page.click('delete-btn');

  // Wait for modal
  await page.waitFor('confirm-modal');
  await expect(page).toBeVisible('confirm-modal');
  await expect(page).toHaveText('modal-message', 'Are you sure?');

  // Confirm
  await page.click('confirm-delete');
  await page.waitForLoaded();

  await expect(page).toHaveURL('/items');
  await expect(page).toBeHidden('confirm-modal');
});
```

### Native Browser Dialogs

Puppet auto-accepts `alert()`, `confirm()`, `prompt()` by default:

```typescript
test('handles native confirm dialog', async ({ page }) => {
  // Change default behavior if needed
  await page.setDialogAction('dismiss'); // or 'accept' (default)

  await page.click('delete-btn'); // Triggers confirm()

  // Check what dialog appeared
  const message = await page.getLastDialog();
  expect(message).toBe('Are you sure you want to delete?');
});
```

### File Uploads

```typescript
test('can upload avatar', async ({ page }) => {
  await page.goto('/settings/profile');

  // Single file
  await page.upload('avatar-input', '/path/to/image.jpg');

  // Multiple files
  await page.upload('attachments', ['/path/to/doc1.pdf', '/path/to/doc2.pdf']);

  await page.click('save');
  await expect(page).toHaveText('status', 'Saved');
});
```

### Working with iframes

```typescript
test('can fill payment iframe', async ({ page }) => {
  await page.goto('/checkout');

  // Switch to iframe
  await page.frame('payment-iframe');

  // Interact within iframe
  await page.type('card-number', '4242424242424242');
  await page.type('expiry', '12/25');
  await page.type('cvc', '123');

  // Return to main page
  await page.mainFrame();

  // Continue on main page
  await page.click('complete-purchase');
});
```

### Scrolling

```typescript
test('infinite scroll loads more items', async ({ page }) => {
  await page.goto('/feed');

  // Initial count
  await expect(page).toHaveCount('feed-item', 10);

  // Scroll down
  await page.scroll('down', 500);
  await page.waitForLoaded();

  // More items loaded
  await expect(page).toHaveCount('feed-item', 20);
});
```

---

## Error Handling

### Screenshot on Failure

Puppet automatically captures screenshots when commands fail. They're saved to `~/.puppet/failures/`.

For Vitest integration, configure in `puppet.config.ts`:

```typescript
import { defineConfig } from 'puppet/test';

export default defineConfig({
  screenshotOnFailure: true,
  screenshotDir: './test-results',
});
```

### Retry Flaky Operations

For elements that may take time to become interactive:

```typescript
// Retry up to 3 times with exponential backoff
await page.click('slow-button', { retry: 3 });

// Custom retry configuration
await page.click('slow-button', {
  retry: { maxAttempts: 5, initialDelay: 200, maxDelay: 3000 },
});
```

### Debugging

```typescript
// Take screenshot at any point
await page.screenshot('./debug.png');

// Get current state
const url = await page.url();
const title = await page.title();
console.log(`Currently at: ${url} - ${title}`);

// Execute arbitrary JS
const count = await page.evaluate('document.querySelectorAll(".item").length');
```

---

## Recording Tests

Use `puppet record` to generate test scaffolds:

```bash
npx puppet record --url=https://example.com --output=tests/recorded.test.ts
```

1. Browser opens, you perform actions
2. Press Ctrl+C when done
3. Edit the generated test to add assertions

The recorder captures clicks, typing, selects, and checkboxes. Add assertions manually:

```typescript
// Generated:
await page.click('login-btn');
await page.type('email', 'test@example.com');
await page.click('submit');

// Add assertions:
await page.click('login-btn');
await page.type('email', 'test@example.com');
await page.click('submit');
await expect(page).toHaveURL('/dashboard'); // Added
await expect(page).toBeVisible('welcome'); // Added
```

---

## Best Practices

### Do

- Use `data-testid` for all interactive elements
- Wait for specific conditions, not arbitrary delays
- Keep tests independent and isolated
- Use descriptive test names
- Test user-visible behavior, not implementation details

### Don't

- Use fragile selectors (generated classes, deep nesting)
- Share state between tests without explicit setup
- Test third-party components in detail
- Over-assert (test what matters, not everything)
- Ignore flaky tests (fix the root cause)

### Test Organization

```
tests/
├── auth/
│   ├── login.test.ts
│   ├── logout.test.ts
│   └── password-reset.test.ts
├── checkout/
│   ├── cart.test.ts
│   └── payment.test.ts
├── helpers/
│   ├── auth.ts        # login(), logout() helpers
│   └── fixtures.ts    # Test data
└── setup.ts           # Global setup
```

---

## Configuration Reference

### puppet.config.ts

```typescript
import { defineConfig } from 'puppet/test';

export default defineConfig({
  baseURL: 'http://localhost:3000',
  headless: true,
  timeout: 30000,
  screenshotOnFailure: true,
  screenshotDir: './test-results',
});
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000, // Browser tests need more time
    hookTimeout: 30000,
  },
});
```

---

## Troubleshooting

| Problem                     | Solution                                                       |
| --------------------------- | -------------------------------------------------------------- |
| Element not found           | Use `waitFor()` before interacting; check selector in DevTools |
| Timeout errors              | Increase timeout; check if element is in iframe                |
| Flaky tests                 | Add explicit waits; use `waitForLoaded()`; add retry           |
| State leaking between tests | Add `clearState()` in `beforeEach`                             |
| Dialog blocking interaction | Configure with `setDialogAction()`                             |
| iframe content inaccessible | Use `frame()` to switch context                                |
