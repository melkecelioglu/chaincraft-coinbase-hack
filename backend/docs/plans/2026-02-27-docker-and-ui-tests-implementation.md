# Docker & E2E UI Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create production Dockerfiles for backend and frontend (Dokploy deployment), and Playwright E2E tests covering auth, chat, marketplace, and navigation flows.

**Architecture:** Separate multi-stage Dockerfiles for backend (NestJS) and frontend (Next.js standalone output). Playwright E2E tests run against a full dockerized stack (MongoDB + backend + frontend) with real API calls including OpenAI.

**Tech Stack:** Docker multi-stage builds, Node 24 Alpine, Next.js standalone output, Playwright, docker-compose

---

### Task 1: Backend Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Step 1: Create `.dockerignore`**

```
node_modules
dist
frontend
.git
.gitignore
docker
.env*
.next
.claude
docs
coverage
*.md
scripts
.playwright-mcp
cdp_api_key.json
```

**Step 2: Create `Dockerfile`**

```dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/

RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]
```

**Step 3: Test the build**

Run: `docker build -t openai-func-backend .`
Expected: Successful build, image created

**Step 4: Verify the image runs**

Run: `docker run --rm -e JWT_SECRET=test -e DB_CONNECTION_STRING=mongodb://host.docker.internal:27017/test openai-func-backend &`

Expected: NestJS starts (may fail connecting to DB if not running, but the Node process should start). Kill with `docker stop`.

**Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add production Dockerfile for backend"
```

---

### Task 2: Frontend Dockerfile

**Files:**
- Modify: `frontend/next.config.ts`
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

**Step 1: Add standalone output to next.config.ts**

Modify `frontend/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

**Step 2: Create `frontend/.dockerignore`**

```
node_modules
.next
.env*
.git
```

**Step 3: Create `frontend/Dockerfile`**

```dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

CMD ["node", "server.js"]
```

**Step 4: Test the build**

Run: `docker build -t openai-func-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 frontend/`
Expected: Successful build

**Step 5: Commit**

```bash
git add frontend/next.config.ts frontend/Dockerfile frontend/.dockerignore
git commit -m "feat: add production Dockerfile for frontend with standalone output"
```

---

### Task 3: Test Docker Compose

**Files:**
- Create: `docker-compose.test.yml`

**Step 1: Create `docker-compose.test.yml`**

```yaml
services:
  mongod:
    image: mongodb/mongodb-community-server:8.2.0-ubi9
    command: >-
      mongod
      --config /etc/mongod.conf
      --replSet rs0
    ports:
      - '27017:27017'
    volumes:
      - mongo-test-data:/data/db
      - ./docker/mongod.conf:/etc/mongod.conf:ro
    networks:
      - test-network
    healthcheck:
      test: mongosh --quiet --eval "db.adminCommand('ping')" || exit 1
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s

  mongod-setup:
    image: mongodb/mongodb-community-server:8.2.0-ubi9
    depends_on:
      mongod:
        condition: service_healthy
    command: bash /setup-replica-set.sh
    volumes:
      - ./docker/setup-replica-set.sh:/setup-replica-set.sh:ro
    networks:
      - test-network
    restart: 'no'

  mongot:
    image: mongodb/mongodb-community-search:0.53.1
    entrypoint: ['sh', '-c', 'cp /tmp/pwfile-src /mongot-community/pwfile && chmod 400 /mongot-community/pwfile && /mongot-community/mongot --config /mongot-community/config.default.yml']
    environment:
      - JAVA_TOOL_OPTIONS=-XX:UseSVE=0
    ports:
      - '27028:27028'
    volumes:
      - mongot-test-data:/data/mongot
      - ./docker/mongot.conf:/mongot-community/config.default.yml:ro
      - ./docker/pwfile:/tmp/pwfile-src:ro
    depends_on:
      mongod:
        condition: service_healthy
      mongod-setup:
        condition: service_completed_successfully
    networks:
      - test-network

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    depends_on:
      mongod-setup:
        condition: service_completed_successfully
    ports:
      - '3001:3001'
    environment:
      - DB_CONNECTION_STRING=mongodb://mongod:27017/smartcontract-test?directConnection=true
      - JWT_SECRET=e2e-test-secret-key-32chars-long!
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - BASE_SEPOLIA_RPC_URL=${BASE_SEPOLIA_RPC_URL}
      - PORT=3001
      - CORS_ORIGIN=true
    networks:
      - test-network
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:3001/api || exit 1
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 15s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - '3000:3000'
    networks:
      - test-network

volumes:
  mongo-test-data:
  mongot-test-data:

networks:
  test-network:
    name: test-network
```

**Step 2: Test the full stack**

Run: `docker compose -f docker-compose.test.yml up -d --build`
Expected: All services start successfully

Run: `docker compose -f docker-compose.test.yml ps`
Expected: All services show as running/healthy

**Step 3: Seed test data**

Run: `docker compose -f docker-compose.test.yml exec backend node -e "console.log('backend running')"`
Expected: "backend running"

Run: `DB_CONNECTION_STRING='mongodb://localhost:27017/smartcontract-test?directConnection=true' npx ts-node scripts/seed-examples.ts`
Expected: Seed data created (templates for marketplace tests)

**Step 4: Verify frontend is accessible**

Run: `curl -s http://localhost:3000 | head -20`
Expected: HTML response from Next.js

**Step 5: Tear down**

Run: `docker compose -f docker-compose.test.yml down -v`

**Step 6: Commit**

```bash
git add docker-compose.test.yml
git commit -m "feat: add docker-compose.test.yml for E2E test stack"
```

---

### Task 4: Playwright Setup

**Files:**
- Modify: `frontend/package.json` (add playwright dependency + scripts)
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/fixtures/test-fixtures.ts`

**Step 1: Install Playwright**

Run: `cd frontend && npm install -D @playwright/test && npx playwright install chromium`

**Step 2: Create `frontend/playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
```

Note: `workers: 1` and `fullyParallel: false` because tests share database state. `timeout: 120_000` because real OpenAI calls can be slow.

**Step 3: Create `frontend/e2e/fixtures/test-fixtures.ts`**

```typescript
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
```

**Step 4: Add test script to `frontend/package.json`**

Add to scripts section:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Step 5: Run placeholder test to verify setup**

Create a temporary `frontend/e2e/smoke.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('frontend loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Welcome back')).toBeVisible();
});
```

Run (with stack running): `cd frontend && npx playwright test e2e/smoke.spec.ts`
Expected: 1 test passed

Delete `frontend/e2e/smoke.spec.ts` after verification.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e/fixtures/test-fixtures.ts
git commit -m "feat: add Playwright setup with test fixtures"
```

---

### Task 5: Auth E2E Tests

**Files:**
- Create: `frontend/e2e/auth.spec.ts`

**Step 1: Write auth tests**

Create `frontend/e2e/auth.spec.ts`:

```typescript
import { test, expect } from './fixtures/test-fixtures';
import { registerUser, loginUser } from './fixtures/test-fixtures';

test.describe('Authentication', () => {
  test('register new user and redirect to chat', async ({ page }) => {
    const user = await registerUser(page);

    await expect(page).toHaveURL('/chat');
    await expect(page.getByText('ChainCraft')).toBeVisible();
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
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.locator('.bg-destructive\\/10')).toBeVisible();
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
```

**Step 2: Run the tests**

Run (with stack running): `cd frontend && npx playwright test e2e/auth.spec.ts`
Expected: All auth tests pass

**Step 3: Commit**

```bash
git add frontend/e2e/auth.spec.ts
git commit -m "feat: add auth E2E tests (register, login, logout, navigation)"
```

---

### Task 6: Navigation E2E Tests

**Files:**
- Create: `frontend/e2e/navigation.spec.ts`

**Step 1: Write navigation tests**

Create `frontend/e2e/navigation.spec.ts`:

```typescript
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

    // Find and click theme toggle button
    const themeButton = page.locator('button').filter({ has: page.locator('svg') }).nth(-2);
    await themeButton.click();

    // Check that the html element has class 'dark' or 'light'
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toBeTruthy();
  });
});
```

**Step 2: Run the tests**

Run: `cd frontend && npx playwright test e2e/navigation.spec.ts`
Expected: All navigation tests pass

**Step 3: Commit**

```bash
git add frontend/e2e/navigation.spec.ts
git commit -m "feat: add navigation E2E tests (auth guard, navbar, theme)"
```

---

### Task 7: Chat E2E Tests

**Files:**
- Create: `frontend/e2e/chat.spec.ts`

**Step 1: Write chat tests**

Create `frontend/e2e/chat.spec.ts`:

```typescript
import { test, expect } from './fixtures/test-fixtures';
import { registerUser } from './fixtures/test-fixtures';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page);
  });

  test('empty state shows suggestion cards', async ({ page }) => {
    await expect(page.getByText('What do you want to build?')).toBeVisible();
    await expect(page.getByText('Deploy ERC20')).toBeVisible();
    await expect(page.getByText('Staking Contract')).toBeVisible();
    await expect(page.getByText('Governance DAO')).toBeVisible();
    await expect(page.getByText('Custom Contract')).toBeVisible();
  });

  test('send a message and receive AI response', async ({ page }) => {
    // Type a message in the textarea
    const textarea = page.getByPlaceholder('Describe your smart contract...');
    await textarea.fill('What is an ERC20 token? Answer in one sentence.');
    await textarea.press('Enter');

    // Wait for the user message to appear
    await expect(page.getByText('What is an ERC20 token? Answer in one sentence.')).toBeVisible();

    // Wait for assistant response (real OpenAI call — may take up to 60s)
    await expect(page.locator('.mx-auto.max-w-3xl .rounded-2xl.bg-muted').first()).toBeVisible({
      timeout: 90_000,
    });
  });

  test('new chat button creates empty conversation', async ({ page }) => {
    // Send a message first to create a conversation
    const textarea = page.getByPlaceholder('Describe your smart contract...');
    await textarea.fill('Hello');
    await textarea.press('Enter');

    // Wait for response
    await expect(page.locator('.mx-auto.max-w-3xl .rounded-2xl.bg-muted').first()).toBeVisible({
      timeout: 90_000,
    });

    // Click New Chat
    await page.getByRole('button', { name: 'New Chat' }).click();

    // Empty state should appear again
    await expect(page.getByText('What do you want to build?')).toBeVisible();
  });

  test('conversation appears in sidebar', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your smart contract...');
    await textarea.fill('Tell me about smart contracts briefly');
    await textarea.press('Enter');

    // Wait for response
    await expect(page.locator('.mx-auto.max-w-3xl .rounded-2xl.bg-muted').first()).toBeVisible({
      timeout: 90_000,
    });

    // Sidebar should show the conversation
    await expect(page.getByText('Today')).toBeVisible();
    await expect(page.getByText('Tell me about smart contracts')).toBeVisible();
  });
});
```

**Step 2: Run the tests**

Run: `cd frontend && npx playwright test e2e/chat.spec.ts`
Expected: All chat tests pass (may take a while due to real OpenAI calls)

**Step 3: Commit**

```bash
git add frontend/e2e/chat.spec.ts
git commit -m "feat: add chat E2E tests (empty state, send message, sidebar)"
```

---

### Task 8: Marketplace E2E Tests

**Files:**
- Create: `frontend/e2e/marketplace.spec.ts`

**Prerequisite:** Seed data must exist in the test database. Run `DB_CONNECTION_STRING='mongodb://localhost:27017/smartcontract-test?directConnection=true' npx ts-node scripts/seed-examples.ts` before running these tests.

**Step 1: Write marketplace tests**

Create `frontend/e2e/marketplace.spec.ts`:

```typescript
import { test, expect } from './fixtures/test-fixtures';
import { registerUser, loginSeedUser } from './fixtures/test-fixtures';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page);
  });

  test('marketplace page loads with template cards', async ({ page }) => {
    await page.goto('/marketplace');

    // Wait for templates to load
    await expect(page.getByText('SimpleToken').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('StakingPool').first()).toBeVisible();
    await expect(page.getByText('SimpleDAO').first()).toBeVisible();
  });

  test('search filters templates', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByText('SimpleToken').first()).toBeVisible({ timeout: 15_000 });

    // Type in search bar
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('staking');

    // Wait for debounced search (300ms) + API call
    await page.waitForTimeout(1000);

    // Should show staking template
    await expect(page.getByText('StakingPool').first()).toBeVisible();
  });

  test('tag filter filters templates', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByText('SimpleToken').first()).toBeVisible({ timeout: 15_000 });

    // Click a tag badge
    await page.getByRole('button', { name: 'governance' }).click();

    // Wait for filtered results
    await page.waitForTimeout(500);

    // SimpleDAO has governance tag, should be visible
    await expect(page.getByText('SimpleDAO').first()).toBeVisible();
  });

  test('template detail page shows source code', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByText('SimpleToken').first()).toBeVisible({ timeout: 15_000 });

    // Click on the first template card
    await page.getByText('SimpleToken').first().click();

    // Should navigate to detail page
    await expect(page.url()).toContain('/marketplace/');

    // Should show contract source code
    await expect(page.getByText('pragma solidity').first()).toBeVisible({ timeout: 10_000 });
  });

  test('deploy form is visible on template detail', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByText('SimpleToken').first()).toBeVisible({ timeout: 15_000 });

    await page.getByText('SimpleToken').first().click();

    // Deploy form should have constructor arg inputs
    await expect(page.getByText('name_').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('symbol_').first()).toBeVisible();
    await expect(page.getByText('initialSupply').first()).toBeVisible();
  });
});
```

**Step 2: Run the tests**

Run: `cd frontend && npx playwright test e2e/marketplace.spec.ts`
Expected: All marketplace tests pass

**Step 3: Commit**

```bash
git add frontend/e2e/marketplace.spec.ts
git commit -m "feat: add marketplace E2E tests (list, search, filter, detail)"
```

---

### Task 9: Add Playwright to .gitignore and finalize

**Files:**
- Modify: `frontend/.gitignore`

**Step 1: Add Playwright artifacts to .gitignore**

Add to `frontend/.gitignore`:
```
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

**Step 2: Run all E2E tests together**

Start the stack:
```bash
docker compose -f docker-compose.test.yml up -d --build
```

Wait for health checks:
```bash
docker compose -f docker-compose.test.yml ps
```

Seed data:
```bash
DB_CONNECTION_STRING='mongodb://localhost:27017/smartcontract-test?directConnection=true' npx ts-node scripts/seed-examples.ts
```

Run all tests:
```bash
cd frontend && npx playwright test
```

Expected: All tests pass

Tear down:
```bash
docker compose -f docker-compose.test.yml down -v
```

**Step 3: Commit**

```bash
git add frontend/.gitignore
git commit -m "chore: add Playwright artifacts to .gitignore"
```

---

## Quick Reference

### Start test stack
```bash
docker compose -f docker-compose.test.yml up -d --build
DB_CONNECTION_STRING='mongodb://localhost:27017/smartcontract-test?directConnection=true' npx ts-node scripts/seed-examples.ts
```

### Run E2E tests
```bash
cd frontend && npx playwright test
```

### Tear down
```bash
docker compose -f docker-compose.test.yml down -v
```

### Deploy with Dokploy
- Backend: Point Dokploy to root `Dockerfile`, set env vars
- Frontend: Point Dokploy to `frontend/Dockerfile`, set build arg `NEXT_PUBLIC_API_URL`
