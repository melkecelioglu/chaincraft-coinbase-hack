# Ethers.js Migration — Replace Coinbase SDK Deployment

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Coinbase SDK wallet import and contract deployment with ethers.js + solc-js to eliminate Coinbase API rate limiting.

**Architecture:** Use `ethers.Wallet.fromPhrase()` for wallet import, `solc-js` for Solidity compilation, and `ethers.ContractFactory` for deployment. All on base-sepolia via Infura RPC. The `BlockchainService` public interface stays identical — callers unchanged.

**Tech Stack:** ethers v6, solc v0.8.28, Infura RPC (base-sepolia)

---

### Task 1: Install dependencies and configure RPC

**Files:**
- Modify: `package.json`
- Modify: `.env` (local only)
- Modify: `.env.example`

**Step 1: Install solc**

```bash
npm install solc@0.8.28
```

**Step 2: Add RPC URL to .env.example**

Add under the Coinbase section replacement:

```
# Blockchain RPC (Base Sepolia)
BASE_SEPOLIA_RPC_URL=https://base-sepolia.infura.io/v3/YOUR_INFURA_KEY
```

**Step 3: Add RPC URL to .env**

```
BASE_SEPOLIA_RPC_URL=https://base-sepolia.infura.io/v3/<actual-key>
```

**Step 4: Verify install**

```bash
npm ls solc
```

Expected: `solc@0.8.28`

---

### Task 2: Create ERC20 contract template

**Files:**
- Create: `src/blockchain/contracts/ERC20Token.sol`

**Step 1: Create the contract directory**

```bash
mkdir -p src/blockchain/contracts
```

**Step 2: Write self-contained ERC20 contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ERC20Token {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply * 10 ** decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from] -= value;
        allowance[from][msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
```

---

### Task 3: Create Solidity compiler service

**Files:**
- Create: `src/blockchain/solc.service.ts`

**Step 1: Write the compiler service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as solc from 'solc';

export interface CompileResult {
  abi: any[];
  bytecode: string;
}

@Injectable()
export class SolcService {
  private readonly logger = new Logger(SolcService.name);

  compile(
    sources: Record<string, { content: string }>,
    contractName: string,
  ): CompileResult {
    const input = {
      language: 'Solidity',
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode'] },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors?.some((e: any) => e.severity === 'error')) {
      const errors = output.errors
        .filter((e: any) => e.severity === 'error')
        .map((e: any) => e.formattedMessage)
        .join('\n');
      throw new Error(`Solidity compilation failed:\n${errors}`);
    }

    // Find the contract in output — search all source files
    for (const file of Object.keys(output.contracts || {})) {
      if (output.contracts[file][contractName]) {
        const contract = output.contracts[file][contractName];
        return {
          abi: contract.abi,
          bytecode: contract.evm.bytecode.object,
        };
      }
    }

    throw new Error(
      `Contract "${contractName}" not found in compilation output`,
    );
  }
}
```

---

### Task 4: Rewrite BlockchainService with ethers.js

**Files:**
- Modify: `src/blockchain/blockchain.service.ts`

**Step 1: Replace entire blockchain service**

```typescript
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { SolcService } from './solc.service';

export interface DeployTokenResult {
  contractAddress: string;
}

export interface DeployCustomContractResult {
  contractAddress: string;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider: ethers.JsonRpcProvider;
  private readonly erc20Source: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly solcService: SolcService,
  ) {
    const rpcUrl = this.configService.getOrThrow('BASE_SEPOLIA_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.erc20Source = fs.readFileSync(
      path.join(__dirname, 'contracts', 'ERC20Token.sol'),
      'utf8',
    );
  }

  private getWallet(mnemonic: string): ethers.Wallet {
    return ethers.Wallet.fromPhrase(mnemonic, this.provider);
  }

  async deployToken(
    name: string,
    symbol: string,
    totalSupply: number,
    mnemonic: string,
  ): Promise<DeployTokenResult> {
    try {
      const wallet = this.getWallet(mnemonic);
      const { abi, bytecode } = this.solcService.compile(
        { 'ERC20Token.sol': { content: this.erc20Source } },
        'ERC20Token',
      );

      this.logger.log('Deploying ERC20 token contract...');
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      const contract = await factory.deploy(name, symbol, totalSupply);
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      this.logger.log(`Token contract deployed to: ${contractAddress}`);

      return { contractAddress };
    } catch (error) {
      this.logger.error('Token deployment failed', {
        message: (error as Error).message,
      });
      throw new HttpException(
        `Failed to deploy contract: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deployCustomContract(
    sources: Record<string, { content: string }>,
    contractName: string,
    constructorArgs: Record<string, string>,
    mnemonic: string,
  ): Promise<DeployCustomContractResult> {
    try {
      const wallet = this.getWallet(mnemonic);
      const { abi, bytecode } = this.solcService.compile(sources, contractName);

      this.logger.log(`Deploying custom contract: ${contractName}...`);
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);

      // Extract constructor arg values in ABI order
      const constructorAbi = abi.find(
        (item: any) => item.type === 'constructor',
      );
      const args = constructorAbi
        ? constructorAbi.inputs.map(
            (input: any) => constructorArgs[input.name] ?? '',
          )
        : [];

      const contract = await factory.deploy(...args);
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      this.logger.log(`Custom contract deployed to: ${contractAddress}`);

      return { contractAddress };
    } catch (error) {
      this.logger.error('Custom contract deployment failed', {
        message: (error as Error).message,
      });
      throw new HttpException(
        `Failed to deploy custom contract: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
```

---

### Task 5: Update BlockchainModule

**Files:**
- Modify: `src/blockchain/blockchain.module.ts`

**Step 1: Register SolcService and import ConfigModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './blockchain.service';
import { SolcService } from './solc.service';

@Module({
  imports: [ConfigModule],
  providers: [BlockchainService, SolcService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
```

---

### Task 6: Update tests

**Files:**
- Modify: `src/blockchain/blockchain.service.spec.ts`

**Step 1: Rewrite blockchain service tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainService } from './blockchain.service';
import { ConfigService } from '@nestjs/config';
import { SolcService } from './solc.service';
import { HttpException } from '@nestjs/common';

jest.mock('ethers', () => {
  const mockContract = {
    waitForDeployment: jest.fn().mockResolvedValue(undefined),
    getAddress: jest.fn().mockReturnValue('0xabc123'),
  };
  const mockContractFactory = jest.fn().mockImplementation(() => ({
    deploy: jest.fn().mockResolvedValue(mockContract),
  }));
  return {
    ethers: {
      JsonRpcProvider: jest.fn(),
      Wallet: {
        fromPhrase: jest.fn().mockReturnValue({}),
      },
      ContractFactory: mockContractFactory,
    },
  };
});

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('pragma solidity ^0.8.20;'),
}));

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('https://rpc.example.com'),
};

const mockSolcService = {
  compile: jest.fn().mockReturnValue({
    abi: [{ type: 'constructor', inputs: [] }],
    bytecode: '0x6080',
  }),
};

describe('BlockchainService', () => {
  let service: BlockchainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SolcService, useValue: mockSolcService },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deployToken', () => {
    it('should deploy a token and return contract address', async () => {
      const result = await service.deployToken(
        'TestToken',
        'TT',
        1000000,
        'test test test test test test test test test test test junk',
      );

      expect(result).toEqual({ contractAddress: '0xabc123' });
      expect(mockSolcService.compile).toHaveBeenCalled();
    });

    it('should throw HttpException on failure', async () => {
      mockSolcService.compile.mockImplementationOnce(() => {
        throw new Error('Compilation failed');
      });

      await expect(
        service.deployToken('Test', 'T', 100, 'bad-mnemonic'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deployCustomContract', () => {
    it('should deploy a custom contract and return address', async () => {
      const sources = {
        'Contract.sol': { content: 'pragma solidity ^0.8.0;' },
      };

      const result = await service.deployCustomContract(
        sources,
        'MyContract',
        { arg1: 'value1' },
        'test test test test test test test test test test test junk',
      );

      expect(result).toEqual({ contractAddress: '0xabc123' });
    });

    it('should throw HttpException on failure', async () => {
      mockSolcService.compile.mockImplementationOnce(() => {
        throw new Error('Compile failed');
      });

      await expect(
        service.deployCustomContract({}, 'Bad', {}, 'bad'),
      ).rejects.toThrow(HttpException);
    });
  });
});
```

---

### Task 7: Remove Coinbase SDK and update config

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`
- Modify: `.env.example`
- Modify: `.gitignore` (remove `cdp_api_key.json` line)

**Step 1: Uninstall Coinbase SDK**

```bash
npm uninstall @coinbase/coinbase-sdk
```

**Step 2: Update CLAUDE.md env vars section**

Replace `cdp_api_key.json` entry with:

```
BASE_SEPOLIA_RPC_URL  — Infura (or Alchemy) RPC for Base Sepolia
```

**Step 3: Remove cdp_api_key.json from .gitignore**

Remove the `cdp_api_key.json` line added in previous PR.

**Step 4: Update .env.example**

Replace Coinbase section with:

```
# Blockchain RPC (Base Sepolia via Infura)
BASE_SEPOLIA_RPC_URL=https://base-sepolia.infura.io/v3/YOUR_KEY
```

---

### Task 8: Copy ERC20Token.sol to dist on build

**Files:**
- Modify: `nest-cli.json` (or `tsconfig.build.json`)

The service reads `ERC20Token.sol` via `__dirname` at runtime, so the `.sol` file needs to be in the `dist/` output. NestJS needs an asset config.

**Step 1: Check nest-cli.json for assets config**

Read `nest-cli.json`. Add or update `compilerOptions.assets`:

```json
{
  "compilerOptions": {
    "assets": [
      {
        "include": "blockchain/contracts/*.sol",
        "outDir": "dist/src"
      }
    ]
  }
}
```

**Step 2: Verify build copies the file**

```bash
npx nest build && ls dist/src/blockchain/contracts/
```

Expected: `ERC20Token.sol`

---

### Task 9: Build and test

**Step 1: Build**

```bash
npx nest build
```

Expected: No errors.

**Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 3: Start backend and test deploy**

```bash
npm run start:dev
```

Login and deploy:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seed@chaincraft.dev","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Deploy an ERC20 token called TestCoin with symbol TST and total supply 1000"}'
```

Expected: `{ contractAddress: "0x...", ... }` — successful deployment without Coinbase rate limits.
