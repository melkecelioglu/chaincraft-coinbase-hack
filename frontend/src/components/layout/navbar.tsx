'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        <ConnectButton.Custom>
          {({
            account,
            chain,
            openChainModal,
            openConnectModal,
            openAccountModal,
            mounted,
          }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            return (
              <div
                {...(!ready && {
                  'aria-hidden': true,
                  style: {
                    opacity: 0,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  },
                })}
              >
                {(() => {
                  if (!connected) {
                    return (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={openConnectModal}
                      >
                        <Wallet className="size-4" />
                        Connect Wallet
                      </Button>
                    );
                  }

                  if (chain.unsupported) {
                    return (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={openChainModal}
                      >
                        Wrong Network
                      </Button>
                    );
                  }

                  return (
                    <div className="relative" ref={dropdownRef}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="gap-2"
                      >
                        {chain.hasIcon && chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain'}
                            src={chain.iconUrl}
                            className="size-4 rounded-full"
                          />
                        )}
                        {account.displayBalance && (
                          <span className="text-muted-foreground">
                            {account.displayBalance}
                          </span>
                        )}
                        <span className="font-medium">
                          {account.displayName}
                        </span>
                        <ChevronDown className="size-3 text-muted-foreground" />
                      </Button>

                      {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-popover p-1.5 shadow-md">
                          <button
                            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                            onClick={() => {
                              navigator.clipboard.writeText(account.address);
                              setDropdownOpen(false);
                            }}
                          >
                            <Copy className="size-4 text-muted-foreground" />
                            Copy Address
                          </button>
                          {chain.name === 'Base Sepolia' && (
                            <a
                              href={`https://sepolia.basescan.org/address/${account.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                              onClick={() => setDropdownOpen(false)}
                            >
                              <ExternalLink className="size-4 text-muted-foreground" />
                              View on Explorer
                            </a>
                          )}
                          <div className="my-1 border-t" />
                          <button
                            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                            onClick={() => {
                              openAccountModal();
                              setDropdownOpen(false);
                            }}
                          >
                            <Power className="size-4" />
                            Disconnect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
