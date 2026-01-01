import { test, expect, setupPuppet, describe, beforeEach } from 'puppet/test';

setupPuppet();

describe('E-commerce Checkout Flow', () => {
  beforeEach(async ({ page }) => {
    await page.clearState();
    await page.goto('/');
  });

  test('user can add item to cart and checkout', async ({ page }) => {
    // Browse to product
    await page.click('nav-products');
    await page.waitForLoaded();

    // Add first product to cart
    await page.click('product-card-1');
    await page.waitFor('product-detail');
    await page.select('size-select', 'medium');
    await page.click('add-to-cart');

    // Verify cart updated
    await expect(page).toHaveText('cart-count', '1');

    // Go to cart
    await page.click('cart-icon');
    await page.waitForLoaded();

    await expect(page).toBeVisible('cart-item');
    await expect(page).toHaveCount('cart-item', 1);

    // Proceed to checkout
    await page.click('checkout-btn');
    await page.waitForLoaded();

    await expect(page).toHaveURL('/checkout');
  });

  test('user can complete purchase with valid payment', async ({ page }) => {
    // Assume cart has items (would use helper in real test)
    await page.goto('/checkout');

    // Fill shipping info
    await page.type('shipping-name', 'John Doe');
    await page.type('shipping-address', '123 Main St');
    await page.type('shipping-city', 'Portland');
    await page.select('shipping-state', 'OR');
    await page.type('shipping-zip', '97201');

    await page.click('continue-to-payment');
    await page.waitForLoaded();

    // Fill payment in iframe
    await page.frame('payment-iframe');
    await page.type('card-number', '4242424242424242');
    await page.type('card-expiry', '12/28');
    await page.type('card-cvc', '123');
    await page.mainFrame();

    // Complete order
    await page.click('place-order');
    await page.waitForLoaded();

    // Verify success
    await expect(page).toHaveURL('/order/confirmation');
    await expect(page).toBeVisible('order-success');
    await expect(page).toHaveText('order-message', 'Thank you for your order');
  });

  test('shows validation errors for invalid shipping info', async ({ page }) => {
    await page.goto('/checkout');

    // Submit without filling form
    await page.click('continue-to-payment');

    // Check validation errors
    await expect(page).toBeVisible('error-shipping-name');
    await expect(page).toBeVisible('error-shipping-address');
    await expect(page).toHaveText('error-shipping-name', 'Name is required');

    // Form should still be on shipping step
    await expect(page).toHaveURL('/checkout');
    await expect(page).toBeVisible('shipping-form');
  });

  test('can apply discount code', async ({ page }) => {
    await page.goto('/cart');

    // Get original total
    const originalTotal = await page.text('cart-total');

    // Apply discount
    await page.type('discount-code', 'SAVE20');
    await page.click('apply-discount');
    await page.waitForLoaded();

    // Verify discount applied
    await expect(page).toBeVisible('discount-applied');
    await expect(page).toHaveText('discount-label', 'SAVE20');

    // Total should be different (lower)
    const newTotal = await page.text('cart-total');
    expect(newTotal).not.toBe(originalTotal);
  });
});

describe('User Authentication', () => {
  beforeEach(async ({ page }) => {
    await page.clearState();
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.type('email', 'user@example.com');
    await page.type('password', 'validpassword123');
    await page.click('login-submit');

    await page.waitForLoaded();

    await expect(page).toHaveURL('/dashboard');
    await expect(page).toBeVisible('user-menu');
    await expect(page).toHaveText('welcome-message', 'Welcome back');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.type('email', 'user@example.com');
    await page.type('password', 'wrongpassword');
    await page.click('login-submit');

    await page.waitForLoaded();

    await expect(page).toHaveURL('/login');
    await expect(page).toBeVisible('login-error');
    await expect(page).toHaveText('login-error', 'Invalid email or password');
  });

  test('user can logout', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.type('email', 'user@example.com');
    await page.type('password', 'validpassword123');
    await page.click('login-submit');
    await page.waitForLoaded();

    // Now logout
    await page.click('user-menu');
    await page.click('logout-btn');
    await page.waitForLoaded();

    await expect(page).toHaveURL('/');
    await expect(page).toBeHidden('user-menu');
    await expect(page).toBeVisible('login-link');
  });
});

describe('Search Functionality', () => {
  test('can search for products', async ({ page }) => {
    await page.goto('/');

    await page.type('search-input', 'blue shirt');
    await page.click('search-submit');

    await page.waitForLoaded();

    await expect(page).toHaveURL('/search');
    await expect(page).toHaveText('search-results-count', '12 results');
    await expect(page).toHaveCount('product-card', 12);
  });

  test('shows no results message for empty search', async ({ page }) => {
    await page.goto('/');

    await page.type('search-input', 'xyznonexistent123');
    await page.click('search-submit');

    await page.waitForLoaded();

    await expect(page).toBeVisible('no-results');
    await expect(page).toHaveText('no-results', 'No products found');
    await expect(page).toHaveCount('product-card', 0);
  });
});
