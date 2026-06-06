import { test, expect } from './fixtures/test-fixtures';
import { registerUser } from './fixtures/test-fixtures';

test.describe('Navigation', () => {
  test('auth guard redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL('/login');
  });

  test('navbar links navigate correctly', async ({ page }) => {
    await registerUser(page);

    // Click Marketplace link
    await page.getByRole('link', { name: 'Marketplace' }).click();
    await expect(page).toHaveURL('/marketplace');

    // Click Chat link
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL('/chat');
  });

  test('logo navigates to chat', async ({ page }) => {
    await registerUser(page);
    await page.goto('/marketplace');

    await page.getByRole('link', { name: 'ChainCraft' }).click();
    await expect(page).toHaveURL('/chat');
  });

  test('theme toggle switches theme', async ({ page }) => {
    await registerUser(page);

    // Get initial theme
    const initialClass = await page.locator('html').getAttribute('class');

    // Click theme toggle
    await page.getByRole('button', { name: 'Toggle theme' }).click();

    // Theme class should change
    const newClass = await page.locator('html').getAttribute('class');
    expect(newClass).not.toBe(initialClass);
  });
});
