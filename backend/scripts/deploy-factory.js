/**
 * Deploy ContractFactory to Base Sepolia (one-time).
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node backend/scripts/deploy-factory.js
 *
 * Requires BASE_SEPOLIA_RPC_URL in backend/.env
 */

const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!RPC_URL) {
  console.error('Missing BASE_SEPOLIA_RPC_URL in backend/.env');
  process.exit(1);
}
if (!PRIVATE_KEY) {
  console.error('Missing DEPLOYER_PRIVATE_KEY env var');
  process.exit(1);
}

async function main() {
  // 1. Read and compile the factory contract
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'blockchain', 'contracts', 'ContractFactory.sol'),
    'utf8',
  );

  const input = {
    language: 'Solidity',
    sources: { 'ContractFactory.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors?.some((e) => e.severity === 'error')) {
    const errors = output.errors
      .filter((e) => e.severity === 'error')
      .map((e) => e.formattedMessage)
      .join('\n');
    console.error('Compilation failed:\n', errors);
    process.exit(1);
  }

  const compiled = output.contracts['ContractFactory.sol']['ContractFactory'];
  const abi = compiled.abi;
  const bytecode = '0x' + compiled.evm.bytecode.object;

  console.log('Factory compiled successfully');

  // 2. Deploy
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Deployer address:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Deployer balance:', ethers.formatEther(balance), 'ETH');

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log('Deploying ContractFactory...');

  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();

  console.log('\n=== Factory Deployed ===');
  console.log('Contract address:', await contract.getAddress());
  console.log('Transaction hash:', receipt.hash);
  console.log('Block number:', receipt.blockNumber);
  console.log('\nAdd to frontend/.env.local:');
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${await contract.getAddress()}`);
}

main().catch((err) => {
  console.error('Deployment failed:', err.message || err);
  process.exit(1);
});
