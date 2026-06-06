# Docker & E2E UI Tests Design

**Date:** 2026-02-27
**Status:** Approved

## Goal

1. Create production-ready Dockerfiles for backend (NestJS) and frontend (Next.js) — deployable via Dokploy
2. Set up Playwright E2E tests for all critical frontend flows, running against a real dockerized backend

## Architecture Decisions

- **Separate Dockerfiles** for backend and frontend (Dokploy deploys each as an independent service)
- **Multi-stage builds** to minimize image size
- **Playwright** for E2E tests (Next.js native support, fast, CI-friendly)
- **Real backend + real OpenAI API** for E2E tests (no mocking)
- **`docker-compose.test.yml`** to orchestrate the full test stack

## 1. Backend Dockerfile

Location: `/Dockerfile`

### Build stage (node:24-alpine)
- Copy `package.json` + `package-lock.json`
- `npm ci` (all deps including dev for build)
- Copy source code
- `npm run build` (nest build — compiles TS, copies .sol assets per nest-cli.json)

### Production stage (node:24-alpine)
- Copy `package.json` + `package-lock.json`
- `npm ci --omit=dev` (production deps only)
- Copy `dist/` from builder
- `EXPOSE 3001`
- `CMD ["node", "dist/main"]`

### Environment variables (injected at runtime via Dokploy)
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `DB_CONNECTION_STRING`
- `BASE_SEPOLIA_RPC_URL`
- `PORT` (default 3001)
- `CORS_ORIGIN`

### .dockerignore (root)
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
```

## 2. Frontend Dockerfile

Location: `/frontend/Dockerfile`

### Prerequisite
Add `output: 'standalone'` to `next.config.ts` — this makes Next.js produce a self-contained `server.js` with only the required node_modules (~50MB vs ~150MB full).

### Build stage (node:24-alpine)
- `ARG NEXT_PUBLIC_API_URL` (build-time variable for API endpoint)
- Copy `package.json` + `package-lock.json`
- `npm ci`
- Copy source code
- `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL`
- `npm run build`

### Production stage (node:24-alpine)
- Copy `.next/standalone/` from builder
- Copy `.next/static/` to `.next/standalone/.next/static/`
- Copy `public/` to `.next/standalone/public/`
- `EXPOSE 3000`
- `ENV HOSTNAME="0.0.0.0"`
- `CMD ["node", "server.js"]`

### .dockerignore (frontend)
```
node_modules
.next
.env*
.git
```

### Dokploy configuration
- Build arg: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` (or Dokploy internal service URL)

## 3. docker-compose.test.yml

Full stack for E2E testing:

```yaml
services:
  mongod:
    # Same as existing docker-compose.yml (MongoDB 8.2 with replica set)
  mongod-setup:
    # Same — initializes replica set
  mongot:
    # Same — vector search sidecar

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
      - JWT_SECRET=test-secret-key-for-e2e
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - BASE_SEPOLIA_RPC_URL=${BASE_SEPOLIA_RPC_URL}
      - PORT=3001
      - CORS_ORIGIN=http://localhost:3000
    networks:
      - mongo-network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    depends_on:
      - backend
    ports:
      - '3000:3000'
    networks:
      - mongo-network
```

### Test workflow
1. `docker compose -f docker-compose.test.yml up -d --build`
2. Wait for all services healthy
3. `cd frontend && npx playwright test`
4. `docker compose -f docker-compose.test.yml down -v`

## 4. Playwright E2E Tests

### Setup

Location: `frontend/e2e/`

Config: `frontend/playwright.config.ts`
- Base URL: `http://localhost:3000`
- Browsers: chromium (primary), optionally firefox/webkit
- Timeout: 60s per test (real API calls may be slow)
- Retries: 1 on CI

### Test files

#### `e2e/auth.spec.ts` — Authentication flows
- **Register**: Fill form (name, username, email, password) → submit → redirected to `/chat`
- **Login**: Fill form (email, password) → submit → redirected to `/chat`
- **Login error**: Invalid credentials → error message displayed
- **Logout**: Open user menu → click sign out → redirected to `/login`

#### `e2e/chat.spec.ts` — Chat interface
- **Empty state**: Suggestion cards visible when no conversation active
- **Send message**: Type message → send → assistant response appears (real OpenAI call)
- **Suggestion card click**: Click suggestion → input populated → send
- **Conversation sidebar**: New conversation appears in sidebar after first message
- **Conversation switching**: Create multiple conversations → switch between them

#### `e2e/marketplace.spec.ts` — Marketplace
- **Template list**: Page loads → template cards visible
- **Search**: Type in search bar → results filter (debounced)
- **Tag filter**: Click tag badge → templates filtered
- **Template detail**: Click card → detail page with source code and deploy form
- **Deploy form**: Fill constructor args → deploy (requires seed templates)

#### `e2e/navigation.spec.ts` — Navigation & guards
- **Auth guard**: Visit `/chat` without auth → redirect to `/login`
- **Navbar links**: Click Chat link → `/chat`, click Marketplace → `/marketplace`
- **Theme toggle**: Click toggle → theme changes (dark/light class)

### Test fixtures (`e2e/fixtures/`)
- `test-fixtures.ts`: Shared helpers
  - `registerAndLogin()`: Creates a unique test user and logs in
  - `login(email, password)`: Logs in an existing user
  - Test user generation with unique email (timestamp-based)

### Seed data
- Tests create their own users via the register flow
- Marketplace tests may need pre-seeded templates (existing `scripts/seed-examples.ts` can be used)

## 5. File Changes Summary

### New files
- `/Dockerfile` — Backend production Dockerfile
- `/frontend/Dockerfile` — Frontend production Dockerfile
- `/.dockerignore` — Root Docker ignore
- `/frontend/.dockerignore` — Frontend Docker ignore
- `/docker-compose.test.yml` — Full stack for E2E testing
- `/frontend/playwright.config.ts` — Playwright configuration
- `/frontend/e2e/fixtures/test-fixtures.ts` — Shared test helpers
- `/frontend/e2e/auth.spec.ts` — Auth E2E tests
- `/frontend/e2e/chat.spec.ts` — Chat E2E tests
- `/frontend/e2e/marketplace.spec.ts` — Marketplace E2E tests
- `/frontend/e2e/navigation.spec.ts` — Navigation E2E tests

### Modified files
- `/frontend/next.config.ts` — Add `output: 'standalone'`
- `/frontend/package.json` — Add Playwright dev dependency + test script
