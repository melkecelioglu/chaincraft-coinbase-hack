# RainbowKit Wallet Auth Design

**Date**: 2026-03-05
**Status**: Approved

## Summary

Replace email/password auth with RainbowKit wallet connect + SIWE (EIP-4361) sign-in. Remove auth pages entirely — app opens to chat. Unconnected wallets cannot interact with chat. Deploy moves from server-side to frontend-side wallet signing.

## Decisions

- **Approach**: RainbowKit + wagmi + viem + custom SIWE backend
- **Deploy flow**: Frontend-side — backend compiles, user's wallet signs deploy tx
- **Migration**: Clean break — remove email, password, walletMnemonic fields from SmartUser
- **Nonce**: Backend-generated, in-memory Map with 5min TTL

## Backend Changes

### SmartUser Schema

```typescript
SmartUser {
  walletAddress: string  // unique, required, primary identifier
  name?: string          // optional
  username?: string      // optional
  createdAt, updatedAt   // timestamps
}
```

Removed fields: `email`, `password`, `walletMnemonic`

### Auth Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/nonce` | GET | Public | Generate random nonce, store in-memory with 5min TTL |
| `/auth/verify` | POST | Public | Verify SIWE message + signature, auto-create user if new, return JWT |
| `/auth/user` | GET | JWT | Return user profile by walletAddress |
| `/auth/balance` | GET | JWT | Return Base Sepolia ETH balance (use walletAddress from JWT) |

Removed endpoints: `POST /auth/register`, `POST /auth/login`

### JWT Payload

```typescript
// Old
{ id: string, email: string, username: string }
// New
{ id: string, walletAddress: string }
```

### SIWE Verify Flow

1. Frontend `GET /auth/nonce` -> backend returns nonce
2. Frontend creates SIWE message (domain, address, nonce, chainId=84532)
3. User signs with wallet
4. Frontend `POST /auth/verify` -> `{ message, signature }`
5. Backend verifies with `siwe` package, checks nonce, invalidates nonce
6. If user doesn't exist, auto-create with walletAddress
7. Return JWT

### Nonce Storage

In-memory `Map<string, { nonce, expiresAt }>`. Single-instance backend. Can migrate to MongoDB for horizontal scale.

### New Dependencies

- `siwe` — SIWE message parse & verify

### Removed Dependencies

- `bcryptjs` — no more passwords

## Frontend Changes

### New Dependencies

- `@rainbow-me/rainbowkit`
- `wagmi`
- `viem`
- `@tanstack/react-query`

### Provider Hierarchy (root layout)

```
<QueryClientProvider>
  <WagmiProvider config={wagmiConfig}>
    <RainbowKitProvider>
      <SiweProvider>        <- custom context for JWT management
        <App />
      </SiweProvider>
    </RainbowKitProvider>
  </WagmiProvider>
</QueryClientProvider>
```

### wagmi Config

- Chain: Base Sepolia (chainId 84532)
- Transport: Infura RPC (from env or public)
- Connectors: RainbowKit defaults (MetaMask, WalletConnect, Coinbase, Rainbow)

### Auth Flow

1. User clicks RainbowKit "Connect Wallet"
2. After wallet connects, SIWE sign request triggers automatically
3. Nonce fetched from backend -> SIWE message created -> wallet signs
4. Signed message sent to backend -> JWT received
5. JWT stored in zustand -> user authenticated

### Page Structure

```
app/layout.tsx (root - providers here)
├── app/(app)/layout.tsx (navbar)
│   ├── app/(app)/chat/page.tsx      <- entry page (/)
│   ├── app/(app)/marketplace/...
```

Removed: `app/(auth)/` directory entirely (login, register pages)

### Chat Gating

- Chat input disabled without wallet connect
- Placeholder: "Connect your wallet to start chatting"
- Input active only when JWT exists (wallet + sign complete)

### Navbar

- Replace user menu with RainbowKit `<ConnectButton />`
- ConnectButton shows wallet address, chain, balance natively
- Disconnect = logout (clear JWT + zustand)

### Auth Store (simplified)

```typescript
interface AuthState {
  token: string | null;
  user: { walletAddress: string } | null;
  setToken: (token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}
```

Removed: `login()`, `register()`, `ethBalance`, `fetchBalance()`

### Deploy Flow (Frontend-side)

1. Backend `POST /contracts/compile` — takes Solidity source, returns ABI + bytecode
2. Frontend uses wagmi `useDeployContract` hook to sign & send deploy tx
3. Tx hash reported to backend: `POST /contracts/register` — saves to DB
4. AI deploy commands in chat return `{ abi, bytecode, constructorArgs }` for frontend Deploy Card

## Cross-Module Impact

### BlockchainModule

- Existing `compileContract()` exposed via new `POST /contracts/compile` endpoint
- New `registerDeployment()` method — receives tx hash + contract address, saves to DB
- Server-side deploy via walletMnemonic no longer used for user deploys

### OpenAiModule (ToolDispatchService)

- AI deploy commands return compile result to frontend instead of auto-deploying
- Frontend renders Deploy Card -> user clicks Deploy -> wallet signs tx
- Similar to existing `deployFromCard` but with real wallet transaction

### MarketplaceModule

- Redeploy uses same compile + frontend deploy pattern

## Files to Delete

- `backend/src/auth/dto/login.dto.ts`
- `backend/src/auth/dto/register.dto.ts`
- `frontend/src/app/(auth)/` (entire directory)
- `frontend/src/components/auth/login-form.tsx`
- `frontend/src/components/auth/register-form.tsx`

## Files to Refactor

- `backend/src/auth/auth.controller.ts` — new nonce/verify endpoints
- `backend/src/auth/auth.service.ts` — SIWE verify, remove register/login
- `backend/src/auth/auth.module.ts` — remove bcrypt, add siwe
- `backend/src/auth/schemas/user.schema.ts` — simplified schema
- `backend/src/auth/strategies/jwt.strategy.ts` — walletAddress-based lookup
- `frontend/src/stores/auth-store.ts` — simplified
- `frontend/src/lib/api.ts` — 401 redirect to / instead of /login
- `frontend/src/components/layout/navbar.tsx` — ConnectButton
- `frontend/src/components/layout/auth-guard.tsx` — wallet-based check
- `frontend/src/components/layout/user-menu.tsx` — possibly remove (ConnectButton replaces)
- `frontend/src/middleware.ts` — update public paths

## Routing Changes

- `/` -> redirect to `/chat` (or chat as root)
- `/login`, `/register` -> removed
- `/marketplace` -> unchanged (public browse, wallet needed for deploy)
