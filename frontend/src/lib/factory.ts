export const FACTORY_ADDRESS = process.env
  .NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;

export const DEPLOY_FEE = BigInt('1000000000000000'); // 0.001 ETH

export const FACTORY_ABI = [
  {
    type: 'function',
    name: 'deploy',
    inputs: [{ name: 'bytecode', type: 'bytes', internalType: 'bytes' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'ContractDeployed',
    inputs: [
      { name: 'deployer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'deployed', type: 'address', indexed: true, internalType: 'address' },
      { name: 'fee', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'function',
    name: 'DEPLOY_FEE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'FEE_RECIPIENT',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
] as const;
