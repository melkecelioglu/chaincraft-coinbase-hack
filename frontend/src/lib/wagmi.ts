import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'ChainCraft',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'chaincraft-dev',
  chains: [baseSepolia],
  ssr: true,
});
