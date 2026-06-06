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
  // NOTE: do not call useSiweAuth() here — its auto-sign-in effects are
  // already mounted once in AuthGuard; a second mount would double-fire
  // sign-in. Disconnect is inlined below (wallet.disconnect + logout).
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
