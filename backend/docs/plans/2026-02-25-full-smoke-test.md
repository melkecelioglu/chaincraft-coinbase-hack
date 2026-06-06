# Full Smoke Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Smoke test every main API endpoint with curl using the seed user, fix any broken backends.

**Architecture:** Sequential curl calls with JWT auth. Each task tests one endpoint group, verifies the response, and fixes issues inline. Frontend build as final validation.

**Tech Stack:** curl, bash, NestJS backend on :3001, seed user `seed@chaincraft.dev` / `password123`

---

### Task 1: Auth — Login + Profile + Balance

**Step 1: Login with seed user**

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seed@chaincraft.dev","password":"password123"}'
```

Expected: JSON with `token`, `email`, `username`, `walletAddress` fields. Save the token for all subsequent requests.

**Step 2: Get user profile**

```bash
curl -s http://localhost:3001/auth/user \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON with `_id`, `name`, `username`, `email`, `walletAddress`. Must NOT include `walletMnemonic` or `password`.

**Step 3: Get wallet balance**

```bash
curl -s http://localhost:3001/auth/balance \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON with `balance` field (string, likely `"0.0"`).

**Step 4: Fix any failures, then move on**

---

### Task 2: Projects — List + Create

**Step 1: List projects**

```bash
curl -s http://localhost:3001/projects \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON array (possibly empty).

**Step 2: Create a project**

```bash
curl -s -X POST http://localhost:3001/projects \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Smoke Test Project"}'
```

Expected: JSON with `_id`, `name`, `user`, `createdAt`. Save the `_id` for later.

**Step 3: List projects again to confirm**

```bash
curl -s http://localhost:3001/projects \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: Array with at least one project including "Smoke Test Project".

**Step 4: Fix any failures, then move on**

---

### Task 3: Tokens — List + Filter by Type

**Step 1: List all tokens**

```bash
curl -s http://localhost:3001/tokens \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON array with seed tokens (3 tokens seeded earlier).

**Step 2: Filter by type erc20**

```bash
curl -s http://localhost:3001/tokens/type/erc20 \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON array with only erc20 type tokens.

**Step 3: Filter by type custom-contract**

```bash
curl -s http://localhost:3001/tokens/type/custom-contract \
  -H "Authorization: Bearer <TOKEN>"
```

Expected: JSON array with only custom-contract type tokens.

**Step 4: Fix any failures, then move on**

---

### Task 4: Marketplace — List + Detail

**Step 1: List marketplace templates**

```bash
curl -s 'http://localhost:3001/marketplace?page=1&limit=10'
```

Expected: JSON with `items` array, `total`, `page`, `limit`. Should contain seed templates.

**Step 2: Get a specific template detail**

Use an `_id` from step 1:

```bash
curl -s http://localhost:3001/marketplace/<TEMPLATE_ID>
```

Expected: Full template object with `name`, `description`, `tags`, `sources`, `contractName`, `constructorArgs`, `creator`, `deployCount`.

**Step 3: Search marketplace**

```bash
curl -s 'http://localhost:3001/marketplace/search?q=erc20&limit=5'
```

Expected: JSON array of matching templates with `score` field. NOTE: This uses `$vectorSearch` — may fail if vector index is not set up. If it fails, run `node scripts/create-vector-index.js` and retry.

**Step 4: Fix any failures, then move on**

---

### Task 5: Chat — Send Message + Chain

**Step 1: Send a simple chat message (no deploy)**

```bash
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"message":"What is a smart contract? Answer in one sentence."}'
```

Expected: JSON with `message` (AI response text), `responseId` (string), `deployments` (empty array). Save `responseId`.

**Step 2: Chain a follow-up message**

```bash
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"message":"Can you give an example?","previousResponseId":"<RESPONSE_ID>"}'
```

Expected: JSON with `message` (context-aware response referencing smart contracts), `responseId`, `deployments` (empty array).

**Step 3: Fix any failures, then move on**

---

### Task 6: Frontend Build Validation

**Step 1: Build the frontend**

```bash
cd /Users/gokbot/Documents/projects/openai-func/frontend && npx next build
```

Expected: Build succeeds with no errors.

**Step 2: If build fails, fix TypeScript/import errors and retry**

---

### Task 7: Summary Report

**Step 1: Create a summary of all test results**

List each endpoint with PASS/FAIL status and any fixes applied. Report in a table format:

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 1 | POST /auth/login | ? | |
| 2 | GET /auth/user | ? | |
| 3 | GET /auth/balance | ? | |
| 4 | GET /projects | ? | |
| 5 | POST /projects | ? | |
| 6 | GET /tokens | ? | |
| 7 | GET /tokens/type/:type | ? | |
| 8 | GET /marketplace | ? | |
| 9 | GET /marketplace/:id | ? | |
| 10 | GET /marketplace/search | ? | |
| 11 | POST /assistants/chat | ? | |
| 12 | POST /assistants/chat (chain) | ? | |
| 13 | Frontend build | ? | |
