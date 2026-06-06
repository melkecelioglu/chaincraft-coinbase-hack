# Privy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RainbowKit + wagmi + WalletConnect with pure Privy (`@privy-io/react-auth`, connect-only mode) on the frontend; backend SIWE/JWT auth unchanged.

**Architecture:** Privy becomes the wallet-connection UI layer (`useConnectWallet` modal, `useWallets` state). viem clients are built manually from Privy's EIP-1193 provider (`lib/viem.ts`). The existing one-signature SIWE → `POST /auth/verify` → JWT-in-zustand flow is preserved exactly. Hook public interfaces (`useSiweAuth`, `useDeployContract`) stay identical so consumers (`auth-guard.tsx`, `pending-deploy-card.tsx`, `deploy-form.tsx`) are untouched.

**Tech Stack:** Next.js 16 / React 19, `@privy-io/react-auth@^3.29.2` (new), `viem` (kept), `siwe` (kept), `zustand` (kept). Removed: `@rainbow-me/rainbowkit`, `wagmi`, `@tanstack/react-query`.

**Spec:** `docs/plans/2026-06-06-privy-migration-design.md` (approved)

**Testing note:** The frontend has no unit-test harness (only Playwright e2e, whose `auth.spec.ts` is already stale — it tests a removed email/password flow and is out of scope). The per-task gate is `npm run build` (full type-check) from `frontend/`; final gates are `npm run lint`, a grep sweep for dead imports, and a browser smoke test. Tasks 2–5 are build-green but runtime-transitional (wagmi hooks without WagmiProvider) — runtime is only expected to work again after Task 5.

**All commands run from `/Users/midex/Documents/openai-func/frontend` unless stated otherwise.**

---

### Task 1: Install Privy SDK + foundation modules

**Files:**
- Modify: `frontend/package.json` (via npm)
- Create: `frontend/src/lib/privy.ts`
- Create: `frontend/src/lib/viem.ts`
- Create: `frontend/src/hooks/use-wallet.ts`
- Create: `frontend/src/hooks/use-balance.ts`

- [ ] **Step 1: Install `@privy-io/react-auth`**

Run: `npm install @privy-io/react-auth@^3.29.2`
Expected: exits 0; `package.json` dependencies gain `"@privy-io/react-auth": "^3.29.2"`. (Peer-dep warnings about solana/stripe packages are normal — they're optional peers.)

- [ ] **Step 2: Create `src/lib/privy.ts`**

```ts
import { baseSepolia } from 'viem/chains';
import type { PrivyClientConfig } from '@privy-io/react-auth';

export const PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'insert-privy-app-id';

// Connect-only setup: Privy is only the wallet-connection UI.
// Auth stays SIWE → backend JWT; Privy's own login/auth is never used.
// Theme + accentColor are injected per-render in providers.tsx (next-themes).
export const privyConfig: PrivyClientConfig = {
  defaultChain: baseSepolia,
  supportedChains: [baseSepolia],
  appearance: {
    walletChainType: 'ethereum-only',
  },
  embeddedWallets: {
    ethereum: { createOnLogin: 'off' },
  },
};
```

- [ ] **Step 3: Create `src/lib/viem.ts`**

```ts
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { ConnectedWallet } from '@privy-io/react-auth';

// Shared read client — http() uses the chain's default RPC (https://sepolia.base.org)
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Build a viem WalletClient from a Privy-connected wallet's EIP-1193 provider.
// Account is hoisted so callers can sign/write without passing it again.
export async function getWalletClient(wallet: ConnectedWallet) {
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as `0x${string}`,
    chain: baseSepolia,
    transport: custom(provider),
  });
}
```

- [ ] **Step 4: Create `src/hooks/use-wallet.ts`**

```ts
'use client';

import { useWallets } from '@privy-io/react-auth';

// Single point of contact with Privy wallet state (consumers: use-siwe-auth,
// use-deploy-contract, navbar). `ready` is true once Privy has finished
// restoring previously-connected wallets — gate connection-dependent
// effects on it to avoid acting on the transient empty state.
export function useWallet() {
  const { wallets, ready } = useWallets();
  const wallet = wallets[0];

  return {
    wallet,
    address: wallet?.address,
    isConnected: ready && wallets.length > 0,
    ready,
  };
}
```

- [ ] **Step 5: Create `src/hooks/use-balance.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { publicClient } from '@/lib/viem';

// Cosmetic navbar balance — fetched once per address change, no polling.
// Errors resolve to null (balance display is best-effort).
export function useBalance(address?: string) {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    publicClient
      .getBalance({ address: address as `0x${string}` })
      .then((wei) => {
        if (!cancelled) {
          setBalance(`${Number(formatEther(wei)).toFixed(4)} ETH`);
        }
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return balance;
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully` — new modules type-check; nothing imports them yet.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/privy.ts src/lib/viem.ts src/hooks/use-wallet.ts src/hooks/use-balance.ts
git commit -m "feat(frontend): add Privy SDK and viem/wallet foundation modules"
```

---

### Task 2: Rewrite providers.tsx, delete lib/wagmi.ts

**Files:**
- Modify: `frontend/src/components/providers.tsx` (full rewrite)
- Delete: `frontend/src/lib/wagmi.ts`

- [ ] **Step 1: Replace the full contents of `src/components/providers.tsx`**

```tsx
'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { PrivyProvider } from '@privy-io/react-auth';
import { PRIVY_APP_ID, privyConfig } from '@/lib/privy';

// Syncs Privy's modal theme with next-themes (parity with the previous
// RainbowKit lightTheme/darkTheme setup). Must be a child of ThemeProvider.
function PrivyThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        ...privyConfig,
        appearance: {
          ...privyConfig.appearance,
          theme: dark ? 'dark' : 'light',
          accentColor: dark ? '#e2e8f0' : '#0f172a',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PrivyThemeBridge>{children}</PrivyThemeBridge>
    </ThemeProvider>
  );
}
```

Removed vs old file: `WagmiProvider`, `QueryClientProvider`, `RainbowKitProvider`, `'@rainbow-me/rainbowkit/styles.css'` import, `useState` QueryClient.

- [ ] **Step 2: Delete the wagmi config**

Run: `rm src/lib/wagmi.ts`

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (Old wagmi/rainbowkit imports in hooks/navbar still compile because the packages are still installed. Runtime is transitional until Task 5 — expected.)

- [ ] **Step 4: Commit**

```bash
git add src/components/providers.tsx src/lib/wagmi.ts
git commit -m "feat(frontend): replace Wagmi/RainbowKit providers with PrivyProvider"
```

---

### Task 3: Rewrite use-siwe-auth.ts

**Files:**
- Modify: `frontend/src/hooks/use-siwe-auth.ts` (full rewrite — same return interface `{ isAuthenticated, isConnected, address, signIn, signOut }`, so `auth-guard.tsx` is untouched)

- [ ] **Step 1: Replace the full contents of `src/hooks/use-siwe-auth.ts`**

```ts
'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { SiweMessage } from 'siwe';
import { baseSepolia } from 'viem/chains';
import { useWallet } from '@/hooks/use-wallet';
import { getWalletClient } from '@/lib/viem';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import type { NonceResponse, VerifyResponse } from '@/lib/types';

function useHasHydrated() {
  return useSyncExternalStore(
    (cb) => useAuthStore.persist.onFinishHydration(cb),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}

export function useSiweAuth() {
  const { wallet, address, isConnected, ready } = useWallet();
  const hydrated = useHasHydrated();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const signIn = useCallback(async () => {
    if (!wallet || !address) return;

    try {
      // 1. Get nonce from backend
      const { data: nonceData } = await api.get<NonceResponse>('/auth/nonce');

      // 2. Create SIWE message (app is Base Sepolia only, so chainId is constant)
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to ChainCraft',
        uri: window.location.origin,
        version: '1',
        chainId: baseSepolia.id,
        nonce: nonceData.nonce,
      });

      const messageStr = siweMessage.prepareMessage();

      // 3. Sign with the wallet via Privy's EIP-1193 provider
      const walletClient = await getWalletClient(wallet);
      const signature = await walletClient.signMessage({ message: messageStr });

      // 4. Verify with backend
      const { data } = await api.post<VerifyResponse>('/auth/verify', {
        message: messageStr,
        signature,
      });

      // 5. Store JWT
      setToken(data.token);

      // 6. Fetch user profile
      await fetchUser();
    } catch (error) {
      console.error('SIWE sign-in failed:', error);
      wallet.disconnect();
      logout();
    }
  }, [wallet, address, setToken, fetchUser, logout]);

  // Auto sign-in when wallet connects and no token exists.
  // Gated on zustand hydration AND Privy wallet restore (`ready`) so a page
  // refresh neither re-prompts a signature nor acts on transient empty state.
  useEffect(() => {
    if (!hydrated || !ready) return;
    if (isConnected && address && !token) {
      signIn();
    }
  }, [hydrated, ready, isConnected, address, token, signIn]);

  // Clear auth when wallet disconnects — only after Privy restore settles,
  // so a refresh doesn't wipe the token mid-reconnect.
  useEffect(() => {
    if (!ready) return;
    if (!isConnected && token) {
      logout();
    }
  }, [ready, isConnected, token, logout]);

  const signOut = useCallback(() => {
    wallet?.disconnect();
    logout();
  }, [wallet, logout]);

  return {
    isAuthenticated: !!token && isConnected,
    isConnected,
    address,
    signIn,
    signOut,
  };
}
```

Changes vs old file: wagmi `useAccount`/`useSignMessage`/`useDisconnect` → `useWallet` + viem `signMessage` + `wallet.disconnect()`; live `chainId` → constant `baseSepolia.id`; both effects now also gated on Privy `ready` (fixes a pre-existing refresh race where the disconnect-effect could clear the token before wagmi finished reconnecting).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-siwe-auth.ts
git commit -m "feat(frontend): port SIWE auth hook from wagmi to Privy"
```

---

### Task 4: Rewrite use-deploy-contract.ts

**Files:**
- Modify: `frontend/src/hooks/use-deploy-contract.ts` (internals only — `{ deploy, isDeploying }` interface unchanged, so `pending-deploy-card.tsx` and `deploy-form.tsx` are untouched)

- [ ] **Step 1: Replace the full contents of `src/hooks/use-deploy-contract.ts`**

```ts
'use client';

import { useCallback, useState } from 'react';
import { encodeDeployData, decodeEventLog } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useWallet } from '@/hooks/use-wallet';
import { getWalletClient, publicClient } from '@/lib/viem';
import api from '@/lib/api';
import { FACTORY_ADDRESS, FACTORY_ABI, DEPLOY_FEE } from '@/lib/factory';

interface DeployParams {
  abi: any[];
  bytecode: string;
  constructorArgs?: any[];
  constructorValues?: Record<string, string>;
  contractName: string;
  sources?: Record<string, { content: string }>;
  projectId?: string;
}

interface DeployResult {
  contractAddress: string;
  txHash: string;
  tokenId: string;
}

export function useDeployContract() {
  const { wallet } = useWallet();
  const [isDeploying, setIsDeploying] = useState(false);

  const deploy = useCallback(
    async (params: DeployParams): Promise<DeployResult> => {
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      if (!FACTORY_ADDRESS) {
        throw new Error('Factory address not configured');
      }

      setIsDeploying(true);
      try {
        // 0. Ensure the wallet is on Base Sepolia before sending the tx.
        // A user rejection throws and surfaces via the consumer's error path.
        await wallet.switchChain(baseSepolia.id);
        const walletClient = await getWalletClient(wallet);

        // 1. Combine bytecode + encoded constructor args
        const bytecodeHex = `0x${params.bytecode}` as `0x${string}`;
        let fullBytecode: `0x${string}`;

        const constructorAbi = params.abi.find(
          (item: any) => item.type === 'constructor',
        );
        if (constructorAbi && params.constructorArgs?.length) {
          fullBytecode = encodeDeployData({
            abi: params.abi,
            bytecode: bytecodeHex,
            args: params.constructorArgs,
          });
        } else {
          fullBytecode = bytecodeHex;
        }

        // 2. Call factory.deploy() with 0.001 ETH fee
        const hash = await walletClient.writeContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'deploy',
          args: [fullBytecode],
          value: DEPLOY_FEE,
        });

        // 3. Wait for receipt and parse ContractDeployed event
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        const deployedEvent = receipt.logs
          .map((log) => {
            try {
              return decodeEventLog({
                abi: FACTORY_ABI,
                data: log.data,
                topics: log.topics,
              });
            } catch {
              return null;
            }
          })
          .find((e) => e?.eventName === 'ContractDeployed');

        if (!deployedEvent || deployedEvent.eventName !== 'ContractDeployed') {
          throw new Error('Contract deployment failed — no ContractDeployed event');
        }

        const contractAddress = (deployedEvent.args as any).deployed as string;

        // 4. Register with backend
        const { data } = await api.post('/contracts/register', {
          txHash: hash,
          contractAddress,
          contractName: params.contractName,
          sources: params.sources,
          abi: params.abi,
          constructorArgs: params.constructorValues || {},
          projectId: params.projectId,
          factoryAddress: FACTORY_ADDRESS,
        });

        return {
          contractAddress,
          txHash: hash,
          tokenId: data.tokenId,
        };
      } finally {
        setIsDeploying(false);
      }
    },
    [wallet],
  );

  return { deploy, isDeploying };
}
```

Changes vs old file: `useWalletClient`/`usePublicClient` → Privy wallet + `lib/viem.ts` clients; new `switchChain` guard (step 0); unused `encodeAbiParameters` import dropped. Steps 1–4 are byte-for-byte the same logic.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-deploy-contract.ts
git commit -m "feat(frontend): port contract deploy hook from wagmi to Privy + viem"
```

---

### Task 5: Rewrite navbar wallet section

**Files:**
- Modify: `frontend/src/components/layout/navbar.tsx` (full rewrite — header/nav-links/ThemeToggle unchanged, wallet widget swapped)

- [ ] **Step 1: Replace the full contents of `src/components/layout/navbar.tsx`**

> Note: the navbar must NOT call `useSiweAuth()` — that hook owns auto-sign-in effects and is already mounted once in `AuthGuard`; a second mount would double-fire sign-in (two nonces, two signature prompts). Disconnect is therefore inlined as `wallet.disconnect()` + store `logout()` (same as `signOut`).

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConnectWallet } from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { useWallet } from '@/hooks/use-wallet';
import { useBalance } from '@/hooks/use-balance';
import { useAuthStore } from '@/stores/auth-store';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Wallet, ChevronDown, Copy, ExternalLink, Power } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/marketplace', label: 'Marketplace' },
];

export function Navbar() {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { wallet, address, isConnected, ready } = useWallet();
  const { connectWallet } = useConnectWallet();
  const logout = useAuthStore((s) => s.logout);
  const balance = useBalance(isConnected ? address : undefined);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const wrongNetwork = !!wallet && wallet.chainId !== `eip155:${baseSepolia.id}`;
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

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
        <ThemeToggle />
        {!ready ? (
          // Invisible placeholder while Privy restores connections — mirrors
          // RainbowKit's `mounted` pattern, avoids layout shift / flash.
          <div aria-hidden className="pointer-events-none select-none opacity-0">
            <Button variant="default" size="sm">
              <Wallet className="size-4" />
              Connect Wallet
            </Button>
          </div>
        ) : !isConnected ? (
          <Button variant="default" size="sm" onClick={() => connectWallet()}>
            <Wallet className="size-4" />
            Connect Wallet
          </Button>
        ) : wrongNetwork ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => wallet?.switchChain(baseSepolia.id).catch(() => {})}
          >
            Wrong Network
          </Button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="gap-2"
            >
              {balance && <span className="text-muted-foreground">{balance}</span>}
              <span className="font-medium">{shortAddress}</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-popover p-1.5 shadow-md">
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                  onClick={() => {
                    if (address) navigator.clipboard.writeText(address);
                    setDropdownOpen(false);
                  }}
                >
                  <Copy className="size-4 text-muted-foreground" />
                  Copy Address
                </button>
                <a
                  href={`https://sepolia.basescan.org/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                  onClick={() => setDropdownOpen(false)}
                >
                  <ExternalLink className="size-4 text-muted-foreground" />
                  View on Explorer
                </a>
                <div className="my-1 border-t" />
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  onClick={() => {
                    wallet?.disconnect();
                    logout();
                    setDropdownOpen(false);
                  }}
                >
                  <Power className="size-4" />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
```

Behavior mapping vs old file: `openConnectModal` → `connectWallet()` (Privy modal); `chain.unsupported` → CAIP-2 check `wallet.chainId !== 'eip155:84532'`; "Wrong Network" click now switches directly instead of opening a chain modal; `account.displayBalance` → `useBalance` hook; `account.displayName` → local truncation; Disconnect via RainbowKit account modal → direct `wallet.disconnect()` + JWT `logout()`; chain icon `<img>` dropped (RainbowKit-specific asset); explorer link no longer name-gated (dropdown only renders on Base Sepolia anyway).

- [ ] **Step 2: Verify build — zero wagmi/rainbowkit imports remain**

Run: `npm run build && grep -rn "@rainbow-me\|from 'wagmi'\|wagmi/chains" src/ ; echo "grep-exit:$?"`
Expected: build `✓ Compiled successfully`; grep finds nothing → prints `grep-exit:1`. (Pattern targets import specifiers — prose comments mentioning RainbowKit don't count.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/navbar.tsx
git commit -m "feat(frontend): replace RainbowKit ConnectButton with Privy connect flow in navbar"
```

---

### Task 6: Remove old packages, full lint + build gate

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via npm)

- [ ] **Step 1: Uninstall replaced packages**

Run: `npm uninstall @rainbow-me/rainbowkit wagmi @tanstack/react-query`
Expected: exits 0; the three packages disappear from `package.json` dependencies. (`viem`, `siwe`, `zustand` remain.)

- [ ] **Step 2: Full gate — build, lint, residual-reference sweep**

Run: `npm run build && npm run lint && grep -rn "@rainbow-me\|from 'wagmi'\|wagmi/chains\|@tanstack/react-query" src/ ; echo "grep-exit:$?"`
Expected: build `✓ Compiled successfully`; lint exits clean; grep prints `grep-exit:1` (no matches).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(frontend): remove rainbowkit, wagmi and react-query"
```

---

### Task 7: Config + docs updates (env var rename)

**Files:**
- Modify: `docker-compose.yml:85`
- Modify: `frontend/Dockerfile:8,11`
- Modify: `CLAUDE.md` (5 spots)
- Create: `frontend/.env.local` (gitignored; does not currently exist)

- [ ] **Step 1: `docker-compose.yml` — swap the frontend build arg**

Old (line 85):
```yaml
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: e7d13680e9ad93fe541ab76812c98240
```
New:
```yaml
        NEXT_PUBLIC_PRIVY_APP_ID: insert-privy-app-id
```
(The placeholder is intentional — user will paste the real App ID from dashboard.privy.io.)

- [ ] **Step 2: `frontend/Dockerfile` — rename ARG/ENV pair**

Old (lines 8 and 11):
```dockerfile
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
```
New:
```dockerfile
ARG NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
```

- [ ] **Step 3: `CLAUDE.md` — update five stale references**

1. Project Overview auth line:
   - Old: `**Auth:** RainbowKit wallet connect + SIWE (EIP-4361) sign-in. No email/password. Backend issues JWT after wallet signature verification. Frontend uses wagmi + viem for wallet interactions.`
   - New: `**Auth:** Privy wallet connect (connect-only) + SIWE (EIP-4361) sign-in. No email/password. Backend issues JWT after wallet signature verification. Frontend uses @privy-io/react-auth + viem for wallet interactions.`
2. Deploy flow line:
   - Old: `**Deploy flow:** Frontend-side. Backend compiles contracts (returns ABI + bytecode), user's wallet signs deploy tx via wagmi, then frontend registers deployment with backend.`
   - New: `**Deploy flow:** Frontend-side. Backend compiles contracts (returns ABI + bytecode), user's wallet signs deploy tx via viem (Privy EIP-1193 provider), then frontend registers deployment with backend.`
3. Env var list (line ~134):
   - Old: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (for WalletConnect v2)`
   - New: `NEXT_PUBLIC_PRIVY_APP_ID (Privy app ID from dashboard.privy.io)`
4. Figma section auth rule:
   - Old: `- IMPORTANT: Auth uses RainbowKit wallet connect + SIWE. Backend: \`GET /auth/nonce\` then \`POST /auth/verify\` with SIWE message+signature to get JWT. Current user: \`GET /auth/user\``
   - New: `- IMPORTANT: Auth uses Privy wallet connect + SIWE. Backend: \`GET /auth/nonce\` then \`POST /auth/verify\` with SIWE message+signature to get JWT. Current user: \`GET /auth/user\``
5. Route→UI mapping table row:
   - Old: `| RainbowKit ConnectButton | Wallet connect + SIWE sign-in (replaces auth forms) |`
   - New: `| Privy connect modal | Wallet connect + SIWE sign-in (replaces auth forms) |`

- [ ] **Step 4: Create `frontend/.env.local`**

```bash
printf 'NEXT_PUBLIC_PRIVY_APP_ID=insert-privy-app-id\n' > .env.local
```
(File is gitignored — placeholder until the user creates a Privy app.)

- [ ] **Step 5: Sweep for any remaining WALLETCONNECT references**

Run (from repo root): `grep -rn "WALLETCONNECT" --include="*.yml" --include="*.ts" --include="*.tsx" --include="Dockerfile" --include="*.md" . | grep -v node_modules | grep -v docs/plans`
Expected: no output (historical `docs/plans/2026-03-05-rainbowkit-wallet-auth-plan.md` is excluded — archived plans are not rewritten).

- [ ] **Step 6: Commit**

```bash
cd /Users/midex/Documents/openai-func
git add docker-compose.yml frontend/Dockerfile CLAUDE.md
git commit -m "chore: rename WalletConnect env var to NEXT_PUBLIC_PRIVY_APP_ID in docker/docs"
```

---

### Task 8: Browser smoke test + handoff notes

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)
Expected: `✓ Ready` on `http://localhost:3000`

- [ ] **Step 2: Smoke-check in browser (Playwright MCP)**

Navigate to `http://localhost:3000/chat` and verify:
- Page renders without crash; "ChainCraft" logo + Chat/Marketplace nav links visible
- No render-blocking errors in console (a Privy network/app-id error IS expected with the placeholder App ID — Privy `ready` may stay false, leaving the connect button invisible; this is the documented dev-placeholder state, not a regression)
- With a real App ID later: "Connect Wallet" appears and clicking it opens the Privy modal listing Ethereum wallets

- [ ] **Step 3: Stop dev server, report results**

Report build/lint/grep/smoke outcomes honestly, including the placeholder-App-ID caveat.

- [ ] **Step 4: Output post-migration setup steps for the user**

```
1. https://dashboard.privy.io → create an app → copy the App ID
2. Paste it into:
   - frontend/.env.local       → NEXT_PUBLIC_PRIVY_APP_ID=<real-id>
   - docker-compose.yml:85     → NEXT_PUBLIC_PRIVY_APP_ID: <real-id>
3. Privy dashboard → Settings → Domains/Allowed origins:
   - http://localhost:3000
   - https://beta.chaincraft.app   (production)
4. Optional: dashboard → Login methods → only "Wallet" (code already enforces
   ethereum-only connect; dashboard setting keeps the config consistent)
5. Restart dev server / rebuild docker image and test connect + SIWE sign-in
```

---

## Out of Scope (explicit)

- Backend: zero changes (`POST /auth/verify` contract unchanged).
- `frontend/e2e/auth.spec.ts`: already stale (tests removed email/password flow) — left as-is.
- `docs/plans/2026-03-05-rainbowkit-wallet-auth-plan.md`: historical document, not rewritten.
