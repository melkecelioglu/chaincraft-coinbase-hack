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
