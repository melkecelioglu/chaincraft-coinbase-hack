import { test as base, expect, type Page } from '@playwright/test';

const TEST_USER = {
  name: 'E2E Test User',
  username: `e2euser_${Date.now()}`,
  email: `e2e_${Date.now()}@test.com`,
  password: 'testpass123',
};

export async function registerUser(page: Page) {
  const user = {
    ...TEST_USER,
    username: `e2euser_${Date.now()}`,
    email: `e2e_${Date.now()}@test.com`,
  };

  await page.goto('/register');
  await page.getByLabel('Full Name').fill(user.name);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.waitForURL('/chat');

  return user;
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/chat');
}

export async function loginSeedUser(page: Page) {
  await loginUser(page, 'seed@chaincraft.dev', 'password123');
}

export { base as test, expect };
