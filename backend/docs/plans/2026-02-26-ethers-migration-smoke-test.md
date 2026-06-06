# Ethers.js Migration Smoke Test

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the ethers.js + solc-js migration works end-to-end with a live contract deployment on Base Sepolia.

**Architecture:** Start the backend against a live MongoDB + Alchemy RPC, seed a test user, fund their wallet, and deploy an ERC20 token via both the direct `/contracts/deploy` endpoint and the AI chat `/assistants/chat` endpoint.

**Tech Stack:** NestJS, ethers v6, solc 0.8.28, Alchemy RPC (Base Sepolia), MongoDB 8.2

---

### Task 1: Verify infrastructure is running

**Step 1: Check MongoDB is up**

```bash
docker compose ps
```

Expected: `mongod` and `mongot` containers running and healthy.

If not running:

```bash
docker compose up -d
```

Wait for health checks, then verify:

```bash
docker compose ps
```

**Step 2: Verify the app builds cleanly**

```bash
npx nest build
```

Expected: No errors. `dist/src/blockchain/contracts/ERC20Token.sol` exists.

**Step 3: Verify unit tests still pass**

```bash
npm test
```

Expected: 10 suites, 68 tests, all passing.

---

### Task 2: Seed test data and start the backend

**Step 1: Run seed script**

```bash
npx ts-node scripts/seed-examples.ts
```

Expected: Seed user `seed@chaincraft.dev` created (or already exists) with a wallet.

**Step 2: Start backend in dev mode (background)**

```bash
npm run start:dev &
```

Wait for `Nest application successfully started` on port 3001.

**Step 3: Verify Swagger docs load**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api
```

Expected: `200`

---

### Task 3: Test auth flow and get wallet address

**Step 1: Login with seed user**

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seed@chaincraft.dev","password":"password123"}'
```

Expected: JSON with `token`, `email`, `walletAddress` fields.

Save the `token` and `walletAddress` from response.

**Step 2: Verify auth with GET /auth/user**

```bash
TOKEN="<token-from-step-1>"
curl -s http://localhost:3001/auth/user \
  -H "Authorization: Bearer $TOKEN"
```

Expected: User profile with `walletAddress` matching step 1.

---

### Task 4: Check wallet balance and fund if needed

**Step 1: Check wallet ETH balance on Base Sepolia**

```bash
curl -s -X POST https://base-sepolia.g.alchemy.com/v2/KeratIqOVqoluDxECtIPl \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["<walletAddress>","latest"],"id":1}'
```

Expected: `result` field with hex balance. If `0x0`, the wallet needs funding.

**Step 2: Fund wallet if balance is zero**

If balance is zero, go to https://www.alchemy.com/faucets/base-sepolia or https://faucet.quicknode.com/base/sepolia and request testnet ETH for `<walletAddress>`.

Wait until balance is non-zero (re-run Step 1 to check).

**Minimum needed:** ~0.001 ETH for a contract deployment.

---

### Task 5: Deploy ERC20 via /contracts/deploy endpoint

**Step 1: Deploy ERC20 token**

```bash
TOKEN="<jwt-token>"
curl -s -X POST http://localhost:3001/contracts/deploy \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "template": "erc20",
    "params": {
      "name": "SmokeTestToken",
      "symbol": "SMK",
      "totalSupply": 1000
    }
  }'
```

Expected: JSON with `contractAddress` (starts with `0x`), `tokenId`, `type: "erc20"`.

**Step 2: Verify contract on BaseScan**

Open `https://sepolia.basescan.org/address/<contractAddress>` in browser.

Expected: Contract exists on Base Sepolia.

**Step 3: Verify token persisted in DB**

```bash
curl -s http://localhost:3001/tokens \
  -H "Authorization: Bearer $TOKEN"
```

Expected: Response includes a token with `type: "erc20"` and data containing `SmokeTestToken`.

---

### Task 6: Deploy via AI chat endpoint

**Step 1: Send chat message requesting ERC20 deploy**

```bash
TOKEN="<jwt-token>"
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Deploy an ERC20 token called ChatTestCoin with symbol CTC and total supply 500"}'
```

Expected: Response with AI message confirming deployment + `deployments` array containing `contractAddress`.

This verifies the full flow: OpenAI → tool dispatch → SolcService compilation → ethers.js deployment → DB persistence.

---

### Task 7: Stop backend and summarize results

**Step 1: Stop the dev server**

Kill the background `npm run start:dev` process.

**Step 2: Summary checklist**

| Test | Expected | Result |
|------|----------|--------|
| Build clean | No errors | ? |
| Unit tests | 68 pass | ? |
| Seed user login | JWT returned | ? |
| Wallet funded | >0 ETH | ? |
| Direct ERC20 deploy | contractAddress returned | ? |
| Contract on BaseScan | Exists | ? |
| Token in DB | Persisted | ? |
| AI chat deploy | contractAddress in deployments | ? |
