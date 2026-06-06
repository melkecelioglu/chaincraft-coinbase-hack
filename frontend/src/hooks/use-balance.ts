'use client';

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { publicClient } from '@/lib/viem';

// Cosmetic navbar balance — fetched once per address change, no polling.
// Errors resolve to null (balance display is best-effort). State is keyed
// by address and derived on read, so no setState is needed in the effect
// body (react-hooks/set-state-in-effect) and a stale balance never shows
// for a different address.
export function useBalance(address?: string) {
  const [data, setData] = useState<{ address: string; balance: string } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    publicClient
      .getBalance({ address: address as `0x${string}` })
      .then((wei) => {
        if (!cancelled) {
          setData({ address, balance: `${Number(formatEther(wei)).toFixed(4)} ETH` });
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return data && data.address === address ? data.balance : null;
}
