'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { SiweMessage } from 'siwe';
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
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const hydrated = useHasHydrated();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const signIn = useCallback(async () => {
    if (!address || !chainId) return;

    try {
      // 1. Get nonce from backend
      const { data: nonceData } = await api.get<NonceResponse>('/auth/nonce');

      // 2. Create SIWE message
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to ChainCraft',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce: nonceData.nonce,
      });

      const messageStr = siweMessage.prepareMessage();

      // 3. Sign with wallet
      const signature = await signMessageAsync({ message: messageStr });

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
      disconnect();
      logout();
    }
  }, [address, chainId, signMessageAsync, setToken, fetchUser, disconnect, logout]);

  // Auto sign-in when wallet connects and no token exists
  // Wait for zustand persist hydration to avoid re-signing on page refresh
  useEffect(() => {
    if (!hydrated) return;
    if (isConnected && address && !token) {
      signIn();
    }
  }, [hydrated, isConnected, address, token, signIn]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected && token) {
      logout();
    }
  }, [isConnected, token, logout]);

  const signOut = useCallback(() => {
    disconnect();
    logout();
  }, [disconnect, logout]);

  return {
    isAuthenticated: !!token && isConnected,
    isConnected,
    address,
    signIn,
    signOut,
  };
}
