'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { PrivyProvider } from '@privy-io/react-auth';
import { PRIVY_APP_ID, privyConfig } from '@/lib/privy';

// Syncs Privy's modal theme with next-themes (parity with the previous
// RainbowKit lightTheme/darkTheme setup). Must be a child of ThemeProvider.
function PrivyThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        ...privyConfig,
        appearance: {
          ...privyConfig.appearance,
          theme: dark ? 'dark' : 'light',
          accentColor: dark ? '#e2e8f0' : '#0f172a',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PrivyThemeBridge>{children}</PrivyThemeBridge>
    </ThemeProvider>
  );
}
