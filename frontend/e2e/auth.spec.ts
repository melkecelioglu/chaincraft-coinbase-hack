import { test, expect } from './fixtures/test-fixtures';
import { registerUser, loginUser } from './fixtures/test-fixtures';

test.describe('Authentication', () => {
  test('register new user and redirect to chat', async ({ page }) => {
    const user = await registerUser(page);

    await expect(page).toHaveURL('/chat');
    await expect(page.getByRole('link', { name: 'ChainCraft' })).toBeVisible();
    await expect(page.getByText('What do you want to build?')).toBeVisible();
  });

  test('login with registered user', async ({ page }) => {
    // First register
    const user = await registerUser(page);

    // Clear localStorage to simulate new session
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');

    // Login with same credentials
    await loginUser(page, user.email, user.password);
    await expect(page).toHaveURL('/chat');
  });

  test('show error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nonexistent@test.com');
    await page.getByLabel('Password').fill('wrongpassword');

    // Intercept login API call to confirm the request is made
    const responsePromise = page.waitForResponse('**/auth/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    const response = await responsePromise;

    // API should return 401
    expect(response.status()).toBe(401);

    // Error message should appear
    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 10_000 });
  });

  test('logout redirects to login', async ({ page }) => {
    await registerUser(page);

    // Open user menu and sign out
    await page.getByRole('button', { name: /e2euser/ }).click();
    await page.getByText('Sign out').click();

    await expect(page).toHaveURL('/login');
  });

  test('navigate between login and register', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Sign up').click();
    await expect(page).toHaveURL('/register');
    await expect(page.getByText('Create account')).toBeVisible();

    await page.getByText('Sign in').click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
