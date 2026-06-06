# Coinbase SDK Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade @coinbase/coinbase-sdk from v0.17.0 to v0.25.0 and switch to JSON file-based configuration so the portal-downloaded key works out of the box.

**Architecture:** Simple version bump + change `Coinbase.configure()` to `Coinbase.configureFromJson()` in blockchain service. No breaking changes in SDK API. v0.20.0 added Ed25519 key support which handles the portal's raw base64 format.

**Tech Stack:** @coinbase/coinbase-sdk v0.25.0, NestJS

---

### Task 1: Update SDK version

**Step 1: Install new version**

```bash
npm install @coinbase/coinbase-sdk@0.25.0
```

**Step 2: Verify install**

```bash
npm ls @coinbase/coinbase-sdk
```

Expected: `@coinbase/coinbase-sdk@0.25.0`

---

### Task 2: Fix JSON key file format

**Files:**
- Modify: `cdp_api_key.json`

The portal gives `{ "id": "...", "privateKey": "..." }` but `configureFromJson` expects `{ "name": "...", "privateKey": "..." }`. Check if v0.25 changed this — if not, rename `id` to `name`.

**Step 1: Check the new SDK's configureFromJson**

Read `node_modules/@coinbase/coinbase-sdk/dist/coinbase/coinbase.js` around `configureFromJson` to see if it accepts `id` field now.

**Step 2: Fix JSON if needed**

If SDK still expects `name`, update `cdp_api_key.json`:
```json
{
  "name": "<value from id field>",
  "privateKey": "<keep as-is>"
}
```

---

### Task 3: Update blockchain service to use JSON config

**Files:**
- Modify: `src/blockchain/blockchain.service.ts`

**Step 1: Switch from `Coinbase.configure()` to `Coinbase.configureFromJson()`**

Replace the constructor's Coinbase configuration:
```typescript
constructor(private readonly configService: ConfigService) {
  Coinbase.configureFromJson({
    filePath: 'cdp_api_key.json',
  });
}
```

Remove:
- `COINBASE_API_KEY` and `COINBASE_API_PRIVATE_KEY` env var reads
- PEM format validation warning
- `crypto`, `fs`, `path` imports (if added earlier)

Keep:
- All deploy methods unchanged
- Error extraction unchanged

**Step 2: Clean up .env**

Remove or comment out the old Coinbase env vars from `.env` since we now use the JSON file.

**Step 3: Update .env.example**

Replace Coinbase section with:
```
# Coinbase SDK — download API key JSON from https://portal.cdp.coinbase.com
# Place cdp_api_key.json in project root
```

**Step 4: Add cdp_api_key.json to .gitignore**

```
cdp_api_key.json
```

---

### Task 4: Build and test

**Step 1: Build backend**

```bash
npx nest build
```

Expected: No errors.

**Step 2: Restart backend and test wallet import**

```bash
node scripts/test-wallet.js
```

Expected: Wallet imported successfully OR a meaningful API error (not "APIError{}").

**Step 3: Test chat deploy**

```bash
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"message":"Deploy an ERC20 token called TestCoin with symbol TST and total supply 1000"}'
```

Expected: Either successful deployment or a clear error message (e.g. insufficient funds).

**Step 4: Run existing tests**

```bash
npm test
```

Expected: All tests pass (SDK is mocked in tests).
