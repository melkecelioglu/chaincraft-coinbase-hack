# API Integration, Seed Data & ETH Balance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the frontend to the live backend API, seed the database with 3 token + 3 contract examples, add ETH balance display in UI using public Base Sepolia RPC, and test the full chat/marketplace flow end-to-end.

**Architecture:** Backend already exposes all needed endpoints. We need: (1) a backend endpoint for wallet ETH balance via public RPC, (2) a seed script to insert example tokens/contracts directly into MongoDB, (3) frontend auth-store to fetch + display ETH balance, (4) end-to-end testing of all flows via Playwright. ETH-related deploy errors are expected (no testnet ETH) and should be handled gracefully.

**Tech Stack:** NestJS (backend), Next.js 15 + zustand (frontend), ethers.js v6 (public RPC balance), MongoDB (seed data), Playwright MCP (browser testing)

**Backend root:** `/Users/gokbot/Documents/projects/openai-func`
**Frontend root:** `/Users/gokbot/Documents/projects/openai-func/frontend`

---

## Task 1: Backend — Add Wallet Balance Endpoint

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add `getWalletBalance` method to AuthService**

Add to `src/auth/auth.service.ts`, after the `getUserByEmail` method:

```typescript
async getWalletBalance(userId: string): Promise<{ balance: string }> {
  const user = await this.userModel.findById(userId);
  if (!user) {
    throw new NotFoundException(`User not found: ${userId}`);
  }

  try {
    const provider = new ethers.JsonRpcProvider(
      'https://sepolia.base.org',
    );
    const balance = await provider.getBalance(user.walletAddress);
    return { balance: ethers.formatEther(balance) };
  } catch (error) {
    this.logger.warn(`Failed to fetch balance for ${user.walletAddress}: ${error.message}`);
    return { balance: '0.0' };
  }
}
```

Note: `ethers` is already imported in this file. The public RPC `https://sepolia.base.org` is free and doesn't need an API key.

**Step 2: Add `GET /auth/balance` endpoint to AuthController**

Add to `src/auth/auth.controller.ts`, after the `getProfile` method:

```typescript
@Get('balance')
@ApiBearerAuth()
@ApiOperation({ summary: 'Get wallet ETH balance on Base Sepolia' })
@ApiResponse({ status: 200, description: 'Wallet balance in ETH' })
async getBalance(@GetUser('id') userId: string) {
  return this.authService.getWalletBalance(userId);
}
```

**Step 3: Add `BalanceResponse` type to frontend types**

Add to `frontend/src/lib/types.ts`, after the `UserProfile` interface:

```typescript
export interface BalanceResponse {
  balance: string;
}
```

**Step 4: Verify backend compiles**

```bash
cd /Users/gokbot/Documents/projects/openai-func
npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.controller.ts frontend/src/lib/types.ts
git commit -m "feat: add wallet balance endpoint using public Base Sepolia RPC"
```

---

## Task 2: Frontend — Auth Store Balance + UI Display

**Files:**
- Modify: `frontend/src/stores/auth-store.ts`
- Modify: `frontend/src/components/layout/navbar.tsx`
- Modify: `frontend/src/components/layout/user-menu.tsx`

**Step 1: Add `ethBalance` state + `fetchBalance` to auth store**

Replace `frontend/src/stores/auth-store.ts` with:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type {
  UserProfile,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
  BalanceResponse,
} from '@/lib/types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  ethBalance: string | null;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  fetchBalance: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      ethBalance: null,

      login: async (data: LoginRequest) => {
        const res = await api.post<LoginResponse>('/auth/login', data);
        set({ token: res.data.token });
      },

      register: async (data: RegisterRequest) => {
        const res = await api.post<RegisterResponse>('/auth/register', data);
        set({ token: res.data.token });
      },

      logout: () => {
        set({ token: null, user: null, ethBalance: null });
      },

      fetchUser: async () => {
        const res = await api.get<UserProfile>('/auth/user');
        set({ user: res.data });
      },

      fetchBalance: async () => {
        try {
          const res = await api.get<BalanceResponse>('/auth/balance');
          set({ ethBalance: res.data.balance });
        } catch {
          set({ ethBalance: '0.0' });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
```

**Step 2: Add ETH balance display to navbar**

Replace `frontend/src/components/layout/navbar.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/marketplace', label: 'Marketplace' },
];

export function Navbar() {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const ethBalance = useAuthStore((s) => s.ethBalance);
  const fetchBalance = useAuthStore((s) => s.fetchBalance);

  useEffect(() => {
    if (token) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [token, fetchBalance]);

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link href="/chat" className="mr-6 flex items-center gap-2 font-bold">
        ChainCraft
      </Link>

      <nav className="flex items-center gap-1">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith(link.href)
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {ethBalance !== null && (
          <div className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium sm:flex">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
            <span>{Number(ethBalance).toFixed(4)} ETH</span>
          </div>
        )}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
```

**Step 3: Also show balance in user dropdown menu**

Replace the `truncatedAddress` DropdownMenuItem in `frontend/src/components/layout/user-menu.tsx` with a more informative version. In the `UserMenu` component, add:

After `const truncatedAddress = ...`:
```typescript
const ethBalance = useAuthStore((s) => s.ethBalance);
```

Then replace the `DropdownMenuItem` that shows `truncatedAddress` with:

```tsx
<DropdownMenuItem className="flex flex-col items-start gap-0.5 text-xs text-muted-foreground">
  <span>{truncatedAddress}</span>
  {ethBalance !== null && <span>{Number(ethBalance).toFixed(4)} ETH (Base Sepolia)</span>}
</DropdownMenuItem>
```

**Step 4: Verify frontend builds**

```bash
cd /Users/gokbot/Documents/projects/openai-func/frontend
npm run lint && npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/stores/auth-store.ts frontend/src/components/layout/navbar.tsx frontend/src/components/layout/user-menu.tsx
git commit -m "feat: display ETH balance in navbar and user menu via public RPC"
```

---

## Task 3: Seed Script — 3 Tokens + 3 Contract Templates

**Files:**
- Create: `scripts/seed-examples.ts`
- Modify: `package.json` (add seed script)

**Step 1: Create seed script**

Create `scripts/seed-examples.ts`:

```typescript
/**
 * Seed script: Inserts 3 example tokens and 3 contract templates into MongoDB.
 *
 * Usage: npx ts-node scripts/seed-examples.ts
 *
 * Requires: DB_CONNECTION_STRING in .env (or defaults to local MongoDB)
 *
 * This creates a seed user "seeduser" if not already present, then inserts
 * example records owned by that user.
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { ethers } from 'ethers';

dotenv.config();

const DB_URI =
  process.env.DB_CONNECTION_STRING ||
  'mongodb://localhost:27017/openai-func?directConnection=true';

// --- Schemas (inline, matching backend) ---

const UserSchema = new mongoose.Schema(
  {
    name: String,
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    password: String,
    walletAddress: String,
    walletMnemonic: String,
  },
  { timestamps: true, collection: 'smartusers' },
);

const TokenSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['erc20', 'custom-contract'] },
    data: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: false },
  },
  { timestamps: true, collection: 'tokens' },
);

const TemplateSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    tags: [String],
    type: { type: String, enum: ['erc20', 'custom-contract'] },
    template: String,
    sources: mongoose.Schema.Types.Mixed,
    contractName: String,
    constructorArgs: mongoose.Schema.Types.Mixed,
    originalDeployment: {
      contractAddress: String,
      chain: String,
      deployedAt: String,
    },
    embedding: [Number],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    deployCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'contracttemplates' },
);

const User = mongoose.model('SmartUser', UserSchema);
const Token = mongoose.model('Token', TokenSchema);
const Template = mongoose.model('ContractTemplate', TemplateSchema);

// --- Fake 1536-dim embedding (zeros — good enough for seed data) ---
const fakeEmbedding = new Array(1536).fill(0);

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('Connected.');

  // 1. Create or find seed user
  let seedUser = await User.findOne({ email: 'seed@chaincraft.dev' });
  if (!seedUser) {
    const wallet = ethers.Wallet.createRandom();
    seedUser = await User.create({
      name: 'Seed User',
      username: 'seeduser',
      email: 'seed@chaincraft.dev',
      password: await bcrypt.hash('password123', 10),
      walletAddress: wallet.address,
      walletMnemonic: wallet.mnemonic?.phrase,
    });
    console.log(`Created seed user: ${seedUser.email} (${seedUser.walletAddress})`);
  } else {
    console.log(`Seed user already exists: ${seedUser.email}`);
  }

  const userId = seedUser._id;

  // 2. Seed 3 Tokens (ERC20 type)
  const tokenData = [
    {
      type: 'erc20' as const,
      data: JSON.stringify({
        contractAddress: '0x1111111111111111111111111111111111111111',
        name: 'ChainCraft Token',
        symbol: 'CCT',
        totalSupply: 1000000,
        deployedAt: '2026-02-20T10:00:00Z',
      }),
    },
    {
      type: 'erc20' as const,
      data: JSON.stringify({
        contractAddress: '0x2222222222222222222222222222222222222222',
        name: 'DeFi Yield Token',
        symbol: 'DYT',
        totalSupply: 5000000,
        deployedAt: '2026-02-21T14:30:00Z',
      }),
    },
    {
      type: 'erc20' as const,
      data: JSON.stringify({
        contractAddress: '0x3333333333333333333333333333333333333333',
        name: 'Governance Power',
        symbol: 'GOV',
        totalSupply: 10000000,
        deployedAt: '2026-02-22T09:15:00Z',
      }),
    },
  ];

  for (const t of tokenData) {
    const exists = await Token.findOne({ data: t.data, user: userId });
    if (!exists) {
      await Token.create({ ...t, user: userId });
      console.log(`Created token: ${JSON.parse(t.data).name}`);
    } else {
      console.log(`Token already exists: ${JSON.parse(t.data).name}`);
    }
  }

  // 3. Seed 3 Contract Templates (marketplace)
  const templates = [
    {
      name: 'SimpleToken',
      description:
        'A standard ERC20 token with configurable name, symbol, and initial supply. Ideal for launching new tokens on Base Sepolia.',
      tags: ['erc20', 'token', 'defi', 'standard'],
      type: 'erc20' as const,
      template: 'erc20',
      sources: {
        'SimpleToken.sol': {
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}`,
        },
      },
      contractName: 'SimpleToken',
      constructorArgs: {
        name_: { type: 'string', description: 'Token name (e.g. "My Token")' },
        symbol_: { type: 'string', description: 'Token symbol (e.g. "MTK")' },
        initialSupply: {
          type: 'uint256',
          description: 'Initial supply (before decimals, e.g. 1000000)',
        },
      },
      originalDeployment: {
        contractAddress: '0xaaaa111111111111111111111111111111111111',
        chain: 'base-sepolia',
        deployedAt: '2026-02-18T10:00:00Z',
      },
      deployCount: 12,
    },
    {
      name: 'StakingPool',
      description:
        'A staking contract where users deposit ERC20 tokens and earn rewards over time. Supports configurable reward rate and lock period.',
      tags: ['staking', 'defi', 'rewards', 'pool'],
      type: 'custom-contract' as const,
      sources: {
        'StakingPool.sol': {
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StakingPool {
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;
    uint256 public rewardRate; // rewards per second per token staked
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeTime;

    constructor(address _stakingToken, uint256 _rewardRate) {
        stakingToken = IERC20(_stakingToken);
        rewardRate = _rewardRate;
    }

    function stake(uint256 amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        lastStakeTime[msg.sender] = block.timestamp;
    }

    function withdraw(uint256 amount) external {
        require(stakedBalance[msg.sender] >= amount, "Insufficient staked balance");
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }
}`,
        },
      },
      contractName: 'StakingPool',
      constructorArgs: {
        _stakingToken: {
          type: 'address',
          description: 'Address of the ERC20 token to stake',
        },
        _rewardRate: {
          type: 'uint256',
          description: 'Reward rate per second per token (in wei)',
        },
      },
      originalDeployment: {
        contractAddress: '0xbbbb222222222222222222222222222222222222',
        chain: 'base-sepolia',
        deployedAt: '2026-02-19T15:30:00Z',
      },
      deployCount: 7,
    },
    {
      name: 'SimpleDAO',
      description:
        'A governance contract with proposal creation, voting with token-weighted ballots, and execution of approved proposals. Minimal DAO for on-chain decision making.',
      tags: ['governance', 'dao', 'voting', 'proposals'],
      type: 'custom-contract' as const,
      sources: {
        'SimpleDAO.sol': {
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleDAO {
    IERC20 public governanceToken;
    uint256 public proposalCount;
    uint256 public votingPeriod;

    struct Proposal {
        string description;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 deadline;
        bool executed;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Proposal) public proposals;

    constructor(address _governanceToken, uint256 _votingPeriod) {
        governanceToken = IERC20(_governanceToken);
        votingPeriod = _votingPeriod;
    }

    function createProposal(string calldata description) external returns (uint256) {
        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.description = description;
        p.deadline = block.timestamp + votingPeriod;
        return id;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.deadline, "Voting ended");
        require(!p.hasVoted[msg.sender], "Already voted");
        uint256 weight = governanceToken.balanceOf(msg.sender);
        require(weight > 0, "No voting power");
        p.hasVoted[msg.sender] = true;
        if (support) p.forVotes += weight;
        else p.againstVotes += weight;
    }
}`,
        },
      },
      contractName: 'SimpleDAO',
      constructorArgs: {
        _governanceToken: {
          type: 'address',
          description: 'Address of the ERC20 governance token',
        },
        _votingPeriod: {
          type: 'uint256',
          description: 'Voting period in seconds (e.g. 86400 for 1 day)',
        },
      },
      originalDeployment: {
        contractAddress: '0xcccc333333333333333333333333333333333333',
        chain: 'base-sepolia',
        deployedAt: '2026-02-20T11:00:00Z',
      },
      deployCount: 5,
    },
  ];

  for (const tpl of templates) {
    const exists = await Template.findOne({ name: tpl.name });
    if (!exists) {
      await Template.create({
        ...tpl,
        embedding: fakeEmbedding,
        creator: userId,
      });
      console.log(`Created template: ${tpl.name}`);
    } else {
      console.log(`Template already exists: ${tpl.name}`);
    }
  }

  console.log('\nSeed complete!');
  console.log(`  - Seed user: seed@chaincraft.dev / password123`);
  console.log(`  - 3 tokens created`);
  console.log(`  - 3 marketplace templates created`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

**Step 2: Add npm script**

Add to root `package.json` scripts:

```json
"seed": "ts-node scripts/seed-examples.ts"
```

**Step 3: Run the seed script**

```bash
cd /Users/gokbot/Documents/projects/openai-func
npx ts-node scripts/seed-examples.ts
```

Expected output:
```
Connecting to MongoDB...
Connected.
Created seed user: seed@chaincraft.dev (0x...)
Created token: ChainCraft Token
Created token: DeFi Yield Token
Created token: Governance Power
Created template: SimpleToken
Created template: StakingPool
Created template: SimpleDAO

Seed complete!
  - Seed user: seed@chaincraft.dev / password123
  - 3 tokens created
  - 3 marketplace templates created
```

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add scripts/seed-examples.ts package.json
git commit -m "feat: add seed script with 3 example tokens and 3 contract templates"
```

---

## Task 4: Start Backend + Frontend, Test Auth Flow in Browser

**Step 1: Ensure MongoDB is running**

```bash
cd /Users/gokbot/Documents/projects/openai-func
docker compose up -d
```

Wait for MongoDB to be ready.

**Step 2: Start backend**

```bash
cd /Users/gokbot/Documents/projects/openai-func
npm run start:dev &
```

Wait until NestJS logs `Nest application successfully started`.

**Step 3: Start frontend**

```bash
cd /Users/gokbot/Documents/projects/openai-func/frontend
npm run dev &
```

Wait until Next.js dev server starts on port 3000.

**Step 4: Test registration flow in browser**

Using Playwright MCP:
1. Navigate to `http://localhost:3000/register`
2. Verify registration form renders (Full Name, Username, Email, Password, Sign Up button)
3. Fill form with a test user (e.g. name: "Test User", username: "testuser1", email: "test1@test.com", password: "password123")
4. Click "Sign Up"
5. Should redirect to `/chat` on success
6. Take screenshot to verify navbar shows username and ETH balance

**Step 5: Test login flow**

1. Navigate to `http://localhost:3000/login`
2. Login with seed user: email `seed@chaincraft.dev`, password `password123`
3. Should redirect to `/chat`
4. Verify navbar shows "seeduser" and ETH balance (likely "0.0000 ETH")
5. Click user menu dropdown — verify wallet address + balance shown
6. Take screenshot

**Step 6: Test logout flow**

1. Click user menu → Sign out
2. Should redirect to `/login`
3. Verify localStorage cleared

---

## Task 5: Test Marketplace Flow in Browser

**Step 1: Login as seed user**

Login with `seed@chaincraft.dev` / `password123`

**Step 2: Navigate to marketplace**

1. Click "Marketplace" in navbar
2. Verify 3 seeded templates render as cards (SimpleToken, StakingPool, SimpleDAO)
3. Verify each card shows: name, description, tags, deploy count, creator
4. Take screenshot of marketplace grid

**Step 3: Test tag filtering**

1. Click "erc20" tag badge
2. Verify only SimpleToken shows (it has "erc20" tag)
3. Click "All" to reset
4. Verify all 3 templates show again

**Step 4: Test template detail page**

1. Click on "SimpleToken" card
2. Verify detail page renders: name, description, tags, source code with syntax highlighting, deploy form with 3 inputs (name_, symbol_, initialSupply), Original Deployment section
3. Take screenshot
4. Navigate back to marketplace

**Step 5: Test deploy form (expect ETH error)**

1. Click on "SimpleToken" card
2. Fill deploy form: name_ = "TestToken", symbol_ = "TST", initialSupply = "1000"
3. Click "Deploy Contract"
4. Expected: Error message (no testnet ETH) — verify error is displayed gracefully in red box, not a crash
5. Take screenshot of error state

---

## Task 6: Test Chat Flow in Browser

**Step 1: Login as seed user**

Navigate to `/chat` (should already be logged in).

**Step 2: Test empty state**

1. Verify "ChainCraft" heading + "What do you want to build?" subtitle
2. Verify 4 suggestion cards render
3. Verify chat input at bottom with placeholder

**Step 3: Test sending a message**

1. Type "Hello, what can you do?" in the chat input
2. Press Enter or click send button
3. Expected behavior depends on whether OPENAI_API_KEY is configured:
   - **If configured:** Should get AI response about smart contract capabilities
   - **If not configured:** Should show error message "Sorry, something went wrong. Please try again." — this is OK
4. Verify user message appears as a bubble on the right
5. Verify assistant response appears on the left
6. Verify conversation appears in sidebar under "Today"
7. Take screenshot

**Step 4: Test suggestion card click**

1. Click "New Chat" button in sidebar
2. Click "Deploy ERC20" suggestion card
3. Verify the prompt text gets sent as a message
4. Wait for response (or error)
5. Take screenshot

**Step 5: Test conversation history**

1. Verify sidebar shows conversations (at least 2 from previous steps)
2. Click on first conversation — verify messages reload
3. Click on second conversation — verify messages switch
4. Delete a conversation (hover → X button) — verify it disappears

**Step 6: Test project context**

1. Create a project via API first (if projects sidebar is empty):
   ```
   POST /projects with { "name": "Test Project" }
   ```
   This can be done via curl or via Playwright executing fetch.
2. Refresh page — verify project appears in sidebar
3. Click on project — verify it highlights (selected)
4. Send a message — the projectId should be included in the API call

---

## Task 7: CORS & API Integration Smoke Test

**Step 1: Verify CORS is working**

Using Playwright, check browser console for CORS errors:
1. Navigate to `/chat`
2. Send a message
3. Check console — should not see "CORS policy" errors
4. If CORS errors exist, verify backend CORS config in `src/main.ts` allows `http://localhost:3000`

**Step 2: Verify all API calls work**

Open browser network tab / Playwright network monitor and verify:
- `GET /auth/user` → 200 with user profile
- `GET /auth/balance` → 200 with `{ balance: "0.0" }` or similar
- `GET /projects` → 200 with array
- `GET /marketplace` → 200 with `{ items: [...], total: 3, page: 1, limit: 12 }`
- `POST /assistants/chat` → 200 or 500 (depending on OpenAI key)

**Step 3: Take final screenshot of each page**

1. `/login` — login form
2. `/chat` — chat with messages
3. `/marketplace` — 3 template cards
4. `/marketplace/:id` — template detail with deploy form

**Step 4: Commit any fixes**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add -A
git commit -m "fix: resolve integration issues found during E2E testing"
```

(Only if there were fixes needed.)

---

## Notes

- **ETH balance will be 0.0000** for new wallets — this is expected. No testnet faucet needed now.
- **Deploy will fail** due to no ETH — this is expected. The error should be caught gracefully.
- **Chat requires OPENAI_API_KEY** in `.env` — if not present, chat will return an error, which is handled by the error message fallback.
- **Marketplace semantic search requires vector index** — run `node scripts/create-vector-index.js` if not already done. Regular listing (`GET /marketplace`) works without it.
- **Seed user credentials:** `seed@chaincraft.dev` / `password123`
