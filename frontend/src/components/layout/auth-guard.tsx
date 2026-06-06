'use client';

import { useSyncExternalStore, useRef } from 'react';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useSiweAuth } from '@/hooks/use-siwe-auth';

function useHasHydrated() {
  return useSyncExternalStore(
    (cb) => {
      const unsub = useAuthStore.persist.onFinishHydration(cb);
      return unsub;
    },
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useHasHydrated();
  const fetchedRef = useRef(false);
  const token = useAuthStore((s) => s.token);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  // Initialize SIWE auth (auto sign-in on wallet connect)
  useSiweAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (token && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchUser().catch(() => {
        // Token invalid — interceptor will clear
      });
    }
  }, [hydrated, token, fetchUser]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // No redirect — just render children. Chat input will be gated separately.
  return <>{children}</>;
}
