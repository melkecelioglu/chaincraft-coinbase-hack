import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { ConnectedWallet } from '@privy-io/react-auth';

// Shared read client — http() uses the chain's default RPC (https://sepolia.base.org)
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Build a viem WalletClient from a Privy-connected wallet's EIP-1193 provider.
// Account is hoisted so callers can sign/write without passing it again.
export async function getWalletClient(wallet: ConnectedWallet) {
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as `0x${string}`,
    chain: baseSepolia,
    transport: custom(provider),
  });
}
