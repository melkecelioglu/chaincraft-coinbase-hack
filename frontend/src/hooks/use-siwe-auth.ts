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
