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
