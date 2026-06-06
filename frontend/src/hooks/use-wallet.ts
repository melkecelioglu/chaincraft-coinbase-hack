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
