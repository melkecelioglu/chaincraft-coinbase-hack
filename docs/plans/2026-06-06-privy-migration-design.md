# Privy Migration Design — Replace RainbowKit/WalletConnect with Privy (Frontend Only)

**Date:** 2026-06-06
**Status:** Approved
**Scope:** Frontend only. Backend SIWE verification, JWT issuance, and all `/auth/*` endpoints are unchanged.

## Goal

Replace the RainbowKit + wagmi + WalletConnect wallet-connection stack with Privy (`@privy-io/react-auth`) in **connect-only** mode. Privy becomes the wallet connection UI layer; the existing one-signature SIWE → backend JWT auth flow is preserved exactly. wagmi and RainbowKit are removed entirely ("pure Privy" — no `@privy-io/wagmi` bridge).

## Decisions (user-confirmed)

1. **Login methods:** External wallets only (MetaMask, Coinbase, WalletConnect-compatible, etc. via Privy's connect modal). No email/social login, no embedded wallets.
2. **Architecture:** Pure Privy — remove `wagmi` and `@rainbow-me/rainbowkit`; build viem clients manually from Privy's EIP-1193 provider. `viem` stays (encoding + clients).
3. **Auth integration:** Connect-only. Privy's own authentication (`login`, `authenticated`, Privy access tokens) is **not used**. Wallet connects via `useConnectWallet`; the app then runs its existing SIWE flow (nonce → `personal_sign` → `POST /auth/verify` → JWT in zustand). Single signature, backend untouched.
4. **Privy App ID:** Placeholder for now (`NEXT_PUBLIC_PRIVY_APP_ID`). User will create an app at dashboard.privy.io later; setup steps documented at the end of implementation.

## Package Changes (`frontend/package.json`)

| Action | Package | Reason |
|---|---|---|
| Remove | `@rainbow-me/rainbowkit` | Replaced by Privy connect modal |
| Remove | `wagmi` | Hooks replaced by Privy `useWallets` + manual viem clients |
| Remove | `@tanstack/react-query` | Only existed to serve `WagmiProvider`; no other usage in `src/` |
| Add | `@privy-io/react-auth` (latest) | Sole new dependency |
| Keep | `viem` | ABI encoding, `createWalletClient`/`createPublicClient`, `formatEther` |
| Keep | `siwe` | EIP-4361 message construction (backend contract unchanged) |
| Keep | `zustand` | JWT/auth store unchanged |

## File-by-File Design

### `src/lib/privy.ts` (NEW — replaces deleted `src/lib/wagmi.ts`)

- `export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'insert-privy-app-id-xxxxx'`
- `export const privyConfig: PrivyClientConfig`:
  - `defaultChain: baseSepolia`, `supportedChains: [baseSepolia]` — imported from `viem/chains` (not `wagmi/chains`)
  - `appearance: { walletChainType: 'ethereum-only', theme, accentColor }` — accent colors preserve current RainbowKit theme: `#0f172a` (light) / `#e2e8f0` (dark)
  - `embeddedWallets: { ethereum: { createOnLogin: 'off' } }` — explicit, although connect-only never triggers creation
- Theme value is injected at provider level (see providers.tsx) since it depends on `next-themes`.

### `src/lib/viem.ts` (NEW)

Replaces wagmi's `usePublicClient`/`useWalletClient`:

- `export const publicClient = createPublicClient({ chain: baseSepolia, transport: http() })` — module-level singleton; `http()` uses the chain's default RPC (`https://sepolia.base.org`)
- `export async function getWalletClient(wallet: ConnectedWallet)`:
  ```ts
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as `0x${string}`,
    chain: baseSepolia,
    transport: custom(provider),
  });
  ```

### `src/components/providers.tsx` (REWRITE)

Provider tree becomes:

```
ThemeProvider (next-themes — unchanged)
└── PrivyThemeBridge (small inner client component)
    └── PrivyProvider (appId=PRIVY_APP_ID, config={...privyConfig, appearance synced})
        └── {children}
```

- `PrivyThemeBridge` reads `useTheme().resolvedTheme` and passes `appearance.theme: 'dark' | 'light'` + matching accentColor into `PrivyProvider` config — preserves the current light/dark parity that RainbowKit's `lightTheme`/`darkTheme` provided.
- Removed: `WagmiProvider`, `QueryClientProvider`, `RainbowKitProvider`, `'@rainbow-me/rainbowkit/styles.css'`.

### `src/hooks/use-wallet.ts` (NEW)

Single point of contact with Privy's wallet state (3 consumers: auth hook, deploy hook, navbar):

```ts
const { wallets, ready } = useWallets();
const wallet = wallets[0];          // first connected external wallet
return {
  wallet,                            // ConnectedWallet | undefined
  address: wallet?.address,          // string | undefined
  isConnected: ready && wallets.length > 0,
  ready,                             // Privy finished restoring connections
};
```

### `src/hooks/use-siwe-auth.ts` (REWRITE — same flow, same return shape)

Return interface is **unchanged**: `{ isAuthenticated, isConnected, address, signIn, signOut }` → `auth-guard.tsx` needs no edits.

Flow (unchanged steps, new plumbing):
1. `GET /auth/nonce` (unchanged)
2. `new SiweMessage({...}).prepareMessage()` — `chainId` becomes the constant `baseSepolia.id` (84532). The app is single-chain; backend verification does not pin chainId. (Previously used wallet's live chainId from `useAccount`.)
3. Sign: `(await getWalletClient(wallet)).signMessage({ message })` — replaces wagmi `useSignMessage`
4. `POST /auth/verify { message, signature }` (unchanged)
5. `setToken` + `fetchUser` (unchanged)

State plumbing:
- `useAccount()` → `useWallet()` (above)
- `useDisconnect()` → `wallet.disconnect()`
- **Auto sign-in effect:** gated on `hydrated && ready && isConnected && address && !token` — `ready` guard added.
- **Auto-logout effect:** gated on `ready && !isConnected && token` — **fixes an existing race**: current code can fire logout during wagmi's async reconnect on page refresh; Privy's `ready` flag makes restore-complete explicit.
- Sign-in failure → `wallet.disconnect()` + `logout()` (current behavior preserved).

### `src/hooks/use-deploy-contract.ts` (REWRITE internals — same `{ deploy, isDeploying }` interface)

`pending-deploy-card.tsx` and `deploy-form.tsx` need no edits.

- `useWalletClient()` → `getWalletClient(wallet)` from `lib/viem.ts` (built inside `deploy()` at call time)
- `usePublicClient()` → module-level `publicClient` from `lib/viem.ts`
- **New guard before sending tx:** `await wallet.switchChain(baseSepolia.id)` — ensures Base Sepolia (replaces RainbowKit's wrong-network modal for the deploy path). A user rejection throws → caught by the existing error path in consumer components.
- Steps 1–4 (encodeDeployData → `factory.deploy` writeContract with 0.001 ETH fee → waitForTransactionReceipt → decodeEventLog `ContractDeployed` → `POST /contracts/register`) are **logically unchanged**.

### `src/components/layout/navbar.tsx` (REWRITE of wallet section only)

- Header/nav links/ThemeToggle unchanged.
- `ConnectButton.Custom` render-prop block replaced with the same visual states driven by Privy:
  - **Not ready:** render hidden/disabled (mirrors RainbowKit `mounted` pattern, avoids hydration flash)
  - **Disconnected:** same "Connect Wallet" button → `connectWallet()` from `useConnectWallet()` (Privy connect modal opens)
  - **Wrong network:** `wallet.chainId !== 'eip155:84532'` (CAIP-2) → same destructive "Wrong Network" button → `wallet.switchChain(baseSepolia.id)` (RainbowKit opened a chain modal; direct switch is the Privy-idiomatic equivalent)
  - **Connected:** existing custom dropdown preserved 1:1 — Copy Address, View on Explorer (basescan link), Disconnect. Disconnect calls `useSiweAuth().signOut()` (disconnect + JWT logout) instead of opening RainbowKit's account modal.
- **Balance display:** RainbowKit's `account.displayBalance` is replaced by a new `src/hooks/use-balance.ts` hook: `publicClient.getBalance({ address })` + `formatEther`, fetched on address change, displayed truncated (e.g. `0.042 ETH`). Refetch on `address`/connection change only (no polling).
- **Address display:** truncated `0x1234…abcd` format (RainbowKit's `displayName` equivalent; no ENS — Base Sepolia has none).
- **Dropped:** chain icon `<img>` (RainbowKit-specific asset; no Privy equivalent).

### `src/hooks/use-balance.ts` (NEW, small)

`useState` + `useEffect` around `publicClient.getBalance` (react-query is removed). Returns formatted string or `null`. Errors → `null` (balance is cosmetic).

## Unchanged

- `src/stores/auth-store.ts`, `src/lib/api.ts`, `src/lib/factory.ts`, `src/lib/types.ts`
- `src/components/layout/auth-guard.tsx`, `src/components/chat/pending-deploy-card.tsx`, `src/components/marketplace/deploy-form.tsx`
- **Entire backend** — `POST /auth/verify` still receives the exact same `{ message, signature }` shape.

## Config / Docs Updates

| File | Change |
|---|---|
| `docker-compose.yml:85` | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: …` → `NEXT_PUBLIC_PRIVY_APP_ID: <placeholder>` |
| `frontend/Dockerfile:8-11` | ARG/ENV rename to `NEXT_PUBLIC_PRIVY_APP_ID` |
| `CLAUDE.md:134` | Env var doc: `NEXT_PUBLIC_PRIVY_APP_ID (Privy app — dashboard.privy.io)`; also update auth wording (RainbowKit → Privy) |
| `frontend/.env.local` | Add `NEXT_PUBLIC_PRIVY_APP_ID=<placeholder>` (file is gitignored; create if absent) |

## Error Handling

- **SIWE sign-in fails / user rejects signature:** disconnect wallet + clear store (current behavior preserved).
- **`switchChain` rejected during deploy:** error propagates to existing try/catch in deploy consumers; surfaced in the deploy card UI.
- **Privy not initialized (`!ready`):** connect button hidden/disabled; auth effects no-op.
- **Missing/invalid App ID:** app renders; connect modal will error — placeholder is dev-only state, documented in setup steps.

## Verification

1. `cd frontend && npm run build` — compiles with all wagmi/rainbowkit imports gone
2. `npm run lint`
3. Browser smoke test (dev server): app renders, navbar shows Connect Wallet, clicking opens Privy modal (full E2E connect requires a real App ID — deferred to user)
4. `grep -r "wagmi\|rainbow" frontend/src` returns nothing
5. Known-stale, out of scope: `frontend/e2e/auth.spec.ts` tests a removed email/password flow (predates wallet auth); left as-is.

## Post-Migration Setup (user action required)

1. Create an app at https://dashboard.privy.io → copy App ID
2. Set `NEXT_PUBLIC_PRIVY_APP_ID` in `frontend/.env.local` and `docker-compose.yml`
3. In Privy dashboard: add `http://localhost:3000` (and production domain) to Allowed origins
4. Optional: configure wallet list / branding in dashboard (code defaults already restrict to Ethereum wallets)
