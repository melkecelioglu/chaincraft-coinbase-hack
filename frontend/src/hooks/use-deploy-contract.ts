'use client';

import { useCallback, useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { encodeAbiParameters, encodeDeployData, decodeEventLog } from 'viem';
import api from '@/lib/api';
import { FACTORY_ADDRESS, FACTORY_ABI, DEPLOY_FEE } from '@/lib/factory';

interface DeployParams {
  abi: any[];
  bytecode: string;
  constructorArgs?: any[];
  constructorValues?: Record<string, string>;
  contractName: string;
  sources?: Record<string, { content: string }>;
  projectId?: string;
}

interface DeployResult {
  contractAddress: string;
  txHash: string;
  tokenId: string;
}

export function useDeployContract() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isDeploying, setIsDeploying] = useState(false);

  const deploy = useCallback(
    async (params: DeployParams): Promise<DeployResult> => {
      if (!walletClient) {
        throw new Error('Wallet not connected');
      }
      if (!publicClient) {
        throw new Error('Public client not available');
      }
      if (!FACTORY_ADDRESS) {
        throw new Error('Factory address not configured');
      }

      setIsDeploying(true);
      try {
        // 1. Combine bytecode + encoded constructor args
        const bytecodeHex = `0x${params.bytecode}` as `0x${string}`;
        let fullBytecode: `0x${string}`;

        const constructorAbi = params.abi.find(
          (item: any) => item.type === 'constructor',
        );
        if (constructorAbi && params.constructorArgs?.length) {
          fullBytecode = encodeDeployData({
            abi: params.abi,
            bytecode: bytecodeHex,
            args: params.constructorArgs,
          });
        } else {
          fullBytecode = bytecodeHex;
        }

        // 2. Call factory.deploy() with 0.001 ETH fee
        const hash = await walletClient.writeContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'deploy',
          args: [fullBytecode],
          value: DEPLOY_FEE,
        });

        // 3. Wait for receipt and parse ContractDeployed event
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        const deployedEvent = receipt.logs
          .map((log) => {
            try {
              return decodeEventLog({
                abi: FACTORY_ABI,
                data: log.data,
                topics: log.topics,
              });
            } catch {
              return null;
            }
          })
          .find((e) => e?.eventName === 'ContractDeployed');

        if (!deployedEvent || deployedEvent.eventName !== 'ContractDeployed') {
          throw new Error('Contract deployment failed — no ContractDeployed event');
        }

        const contractAddress = (deployedEvent.args as any).deployed as string;

        // 4. Register with backend
        const { data } = await api.post('/contracts/register', {
          txHash: hash,
          contractAddress,
          contractName: params.contractName,
          sources: params.sources,
          abi: params.abi,
          constructorArgs: params.constructorValues || {},
          projectId: params.projectId,
          factoryAddress: FACTORY_ADDRESS,
        });

        return {
          contractAddress,
          txHash: hash,
          tokenId: data.tokenId,
        };
      } finally {
        setIsDeploying(false);
      }
    },
    [walletClient, publicClient],
  );

  return { deploy, isDeploying };
}
