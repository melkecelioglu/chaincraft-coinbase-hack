# Compile-Fix Loop UI Smoke Test Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the compile-fix loop works end-to-end from the UI — generate 4 different custom contracts via chat, deploy each, and confirm they appear in the marketplace.

**Architecture:** Browser-based smoke test using Playwright MCP. Navigate the frontend UI, interact with chat, verify deployment cards and marketplace entries.

**Tech Stack:** Playwright MCP browser automation, Next.js frontend (port 3000), NestJS backend (port 3001), MongoDB + Docker

---

## Prerequisites

Before starting tests, ensure all services are running:

```bash
# Terminal 1: MongoDB + mongot
docker compose up -d

# Terminal 2: Backend (port 3001)
cd /Users/gokbot/Documents/projects/openai-func
npm run start:dev

# Terminal 3: Frontend (port 3000)
cd /Users/gokbot/Documents/projects/openai-func/frontend
npm run dev
```

Verify:
- `http://localhost:3001/api` shows Swagger UI
- `http://localhost:3000` loads the frontend

---

### Task 1: Login and verify chat access

**Step 1: Navigate to frontend**

Open browser to `http://localhost:3000`. Should redirect to `/login`.

**Step 2: Register or login**

If no account exists, click "Sign up" and register with:
- Name: `Smoke Test User`
- Username: `smoketest`
- Email: `smoke@test.com`
- Password: `test123456`

If account exists, login with email `smoke@test.com` and password `test123456`.

**Step 3: Verify redirect to chat**

After login, should redirect to `/chat`. Verify the chat input textarea is visible with placeholder "Describe your smart contract...".

---

### Task 2: Test 1 — Simple ERC20-like token contract

This tests a straightforward contract that should compile on the first attempt.

**Step 1: Send chat message**

Type and send:
```
Create a simple token contract called SmokeToken with a name, symbol, and total supply that mints all tokens to the deployer. Include a constructor that takes name, symbol, and totalSupply parameters.
```

**Step 2: Wait for AI response**

Wait for the AI response to appear. Look for:
- A Solidity code block in the response
- A **pending deploy card** showing constructor args (name, symbol, totalSupply)

If no pending deploy card appears, the compile-fix loop may have failed. Check backend logs for `Compilation failed` messages.

**Step 3: Provide constructor args and deploy**

Type and send:
```
Deploy it with constructor args: name: "SmokeToken", symbol: "SMK", totalSupply: "1000000"
```

**Step 4: Verify deployment**

Wait for the deployment response. Look for:
- A **green deployment card** showing the contract address
- "View on Explorer" and "Copy" buttons on the card
- Contract address format: `0x...` (42 chars)

Note the contract address for later verification.

**Step 5: Verify in marketplace**

Navigate to `http://localhost:3000/marketplace`. Look for:
- The deployed contract should appear in the template grid
- Card should show the contract name, description, and tags

---

### Task 3: Test 2 — Complex vesting contract (likely triggers compile-fix)

This tests a more complex contract that may trigger the compile-fix loop.

**Step 1: Start new conversation**

Click "New Conversation" in the sidebar (or navigate to `/chat`).

**Step 2: Send chat message**

Type and send:
```
Create a token vesting contract called VestingVault that allows an owner to create vesting schedules for beneficiaries. Each schedule should have a start time, cliff period, total duration, and total amount. Include functions to create a vesting schedule, calculate vested amount, and release vested tokens. The constructor should take a token address and an initial owner address.
```

**Step 3: Wait for AI response**

Wait for the AI response. Look for:
- Solidity code block with a complex contract
- **Pending deploy card** showing constructor args: `token_` (address) and `initialOwner` (address)

If no pending deploy card appears but the AI shows the contract, check backend logs. The compile-fix loop should log `Compilation failed (attempt X/3), requesting AI fix` if retries happened.

**Step 4: Deploy with constructor args**

Type and send:
```
Deploy it with token: 0x07De47e4A4654c93d35DEC65C2F0819240861a0B, initialOwner: 0x16850b149B5bD41aAE55a83c1364a11E36956cB9
```

(Use any valid Ethereum addresses — these are just test addresses on Base Sepolia)

**Step 5: Verify deployment**

Wait for the deployment response. Look for the green deployment card with contract address.

**Step 6: Verify in marketplace**

Navigate to marketplace. The VestingVault contract should now appear alongside the SmokeToken from Test 1.

---

### Task 4: Test 3 — Staking contract with rewards

**Step 1: Start new conversation**

Click "New Conversation" in the sidebar.

**Step 2: Send chat message**

Type and send:
```
Create a staking contract called StakeRewards where users can stake an ERC20 token and earn rewards over time. The reward rate should be configurable by the owner. Include functions for staking, unstaking, calculating rewards, and claiming rewards. Constructor should take the staking token address and reward rate per second.
```

**Step 3: Wait for AI response**

Look for pending deploy card with constructor args (stakingToken address, rewardRate uint256).

**Step 4: Deploy**

Type and send:
```
Deploy with stakingToken: 0x07De47e4A4654c93d35DEC65C2F0819240861a0B, rewardRate: 100
```

**Step 5: Verify deployment card appears**

Green deployment card with contract address.

**Step 6: Verify in marketplace**

Navigate to marketplace. StakeRewards should appear.

---

### Task 5: Test 4 — Multi-sig wallet contract

**Step 1: Start new conversation**

Click "New Conversation" in the sidebar.

**Step 2: Send chat message**

Type and send:
```
Create a multi-signature wallet contract called MultiSigWallet where multiple owners must approve transactions before they can be executed. Constructor should take an array of owner addresses and the number of required confirmations. Include functions to submit, confirm, and execute transactions.
```

**Step 3: Wait for AI response**

Look for pending deploy card with constructor args (owners address[], requiredConfirmations uint256).

**Step 4: Deploy**

Type and send:
```
Deploy with owners: ["0x16850b149B5bD41aAE55a83c1364a11E36956cB9", "0x07De47e4A4654c93d35DEC65C2F0819240861a0B"], requiredConfirmations: 2
```

**Step 5: Verify deployment card**

Green deployment card with contract address.

**Step 6: Verify marketplace has all 4 contracts**

Navigate to marketplace. All 4 contracts should be visible:
1. SmokeToken
2. VestingVault
3. StakeRewards
4. MultiSigWallet

Use the search bar to search for each by name. Each should appear in search results.

---

### Task 6: Final verification — Marketplace search and detail

**Step 1: Test search**

On the marketplace page, search for "vesting". VestingVault should appear in results.

**Step 2: Test tag filter**

Look at the tag badges on the contract cards. Click a tag to filter by it.

**Step 3: Test contract detail**

Click on any contract card to view its detail page. Verify:
- Contract name and description visible
- Tags shown as badges
- Source code or deploy info visible
- "Deploy" / "Redeploy" action available

**Step 4: Document results**

Record for each of the 4 tests:
- Did the pending deploy card appear? (constructor args UI)
- Did deployment succeed? (green card with address)
- Did the contract appear in marketplace?
- Were there any compile-fix retries visible in backend logs?

Check backend logs (Terminal 2) for messages like:
```
Compilation failed (attempt 1/3), requesting AI fix
```
This indicates the compile-fix loop was triggered and working.
