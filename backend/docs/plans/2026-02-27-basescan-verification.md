# Basescan Contract Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically verify deployed contracts on Basescan (Base Sepolia) after every deploy across all 3 deploy paths.

**Architecture:** Add a `verifyContract()` method to `BlockchainService` that submits source code to the Basescan API for verification. Update `SolcService` to return the compiler version. Call verification fire-and-forget (async, best-effort) from all 3 deploy paths. Uses Node built-in `fetch` — no new dependencies.

**Tech Stack:** NestJS, ethers.js v6, solc-js, Basescan API (Etherscan-compatible)

---

### Task 1: Update SolcService to return compiler version

**Files:**
- Modify: `src/blockchain/solc.service.ts`

**Step 1: Update CompileResult interface to include compilerVersion**

In `src/blockchain/solc.service.ts`, add `compilerVersion` to the `CompileResult` interface and return it from `compile()`:

```typescript
export interface CompileResult {
  abi: any[];
  bytecode: string;
  compilerVersion: string;
}
```

**Step 2: Return compiler version from compile method**

At the top of the `compile()` method, capture the version. The `solc.version()` function returns e.g. `0.8.28+commit.7893614a.Emscripten.clang`. Basescan expects the format `v0.8.28+commit.7893614a`, so strip the trailing `.Emscripten.clang` part and prepend `v`:

```typescript
compile(
  sources: Record<string, { content: string }>,
  contractName: string,
): CompileResult {
  const rawVersion = (solc as any).version() as string;
  // "0.8.28+commit.7893614a.Emscripten.clang" → "v0.8.28+commit.7893614a"
  const compilerVersion = 'v' + rawVersion.split('.Emscripten')[0];

  // ... existing compile logic unchanged ...

  // In the return statement at the bottom (inside the for loop), add compilerVersion:
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
    compilerVersion,
  };
}
```

**Step 3: Run tests to verify nothing is broken**

Run: `npx jest --testPathPattern=blockchain.service.spec -v`
Expected: All existing tests PASS (they mock `solcService.compile` so new field is irrelevant)

**Step 4: Commit**

```bash
git add src/blockchain/solc.service.ts
git commit -m "feat: return compiler version from SolcService.compile()"
```

---

### Task 2: Add verifyContract method to BlockchainService

**Files:**
- Modify: `src/blockchain/blockchain.service.ts`
- Modify: `src/blockchain/blockchain.service.spec.ts`

**Step 1: Write the test for verifyContract**

Add a new `describe('verifyContract')` block to `src/blockchain/blockchain.service.spec.ts`. Mock `global.fetch` since the method uses the Basescan API:

```typescript
describe('verifyContract', () => {
  const verifyParams = {
    contractAddress: '0xabc123',
    sources: { 'Contract.sol': { content: 'pragma solidity ^0.8.0;' } },
    contractName: 'MyContract',
    compilerVersion: 'v0.8.28+commit.7893614a',
    constructorArgs: {},
    abi: [{ type: 'constructor', inputs: [] }],
  };

  it('should submit verification and poll for result', async () => {
    const mockFetch = jest.fn()
      // First call: submit verification
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ status: '1', result: 'guid-123' }),
      })
      // Second call: check status
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ status: '1', result: 'Pass - Verified' }),
      });
    global.fetch = mockFetch;

    await service.verifyContract(verifyParams);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call should be POST to basescan API
    expect(mockFetch.mock.calls[0][0]).toBe('https://api-sepolia.basescan.org/api');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('should not throw when verification fails', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({ status: '0', result: 'Error!' }),
    });
    global.fetch = mockFetch;

    // Should not throw — fire-and-forget
    await expect(service.verifyContract(verifyParams)).resolves.not.toThrow();
  });

  it('should not throw when fetch itself fails', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await expect(service.verifyContract(verifyParams)).resolves.not.toThrow();
  });

  it('should skip verification when BASESCAN_API_KEY is not set', async () => {
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'BASESCAN_API_KEY') throw new Error('not set');
      return 'https://rpc.example.com';
    });
    // Rebuild module to pick up new config behavior
    const module = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SolcService, useValue: mockSolcService },
      ],
    }).compile();
    const svc = module.get<BlockchainService>(BlockchainService);

    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    await svc.verifyContract(verifyParams);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Important:** You'll need to add `import { Test, TestingModule } from '@nestjs/testing';` at the top if not already imported (it is already).

Also update `mockConfigService.getOrThrow` mock to handle the new key. Change the mock at the top of the test file:

```typescript
const mockConfigService = {
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'BASE_SEPOLIA_RPC_URL') return 'https://rpc.example.com';
    if (key === 'BASESCAN_API_KEY') return 'test-api-key';
    return '';
  }),
};
```

**Step 2: Run the test to verify it fails**

Run: `npx jest --testPathPattern=blockchain.service.spec -v`
Expected: FAIL — `service.verifyContract is not a function`

**Step 3: Implement verifyContract in BlockchainService**

Add the following to `src/blockchain/blockchain.service.ts`:

1. Add a `basescanApiKey` field in the constructor. Use `configService.get()` (not `getOrThrow`) so it's optional:

```typescript
private readonly basescanApiKey: string | undefined;

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
  this.basescanApiKey = this.configService.get<string>('BASESCAN_API_KEY');
}
```

2. Add the `verifyContract` method:

```typescript
async verifyContract(params: {
  contractAddress: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  compilerVersion: string;
  constructorArgs: Record<string, string>;
  abi: any[];
}): Promise<void> {
  if (!this.basescanApiKey) {
    this.logger.warn('BASESCAN_API_KEY not set — skipping contract verification');
    return;
  }

  try {
    // Find the source file that contains the contract
    const sourceFile = Object.keys(params.sources).find((f) =>
      f.replace('.sol', '') === params.contractName ||
      params.sources[f].content.includes(`contract ${params.contractName}`)
    ) || Object.keys(params.sources)[0];

    // Build standard JSON input (same format solc expects)
    const standardJsonInput = JSON.stringify({
      language: 'Solidity',
      sources: params.sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode'] },
        },
      },
    });

    // Encode constructor arguments if any
    let encodedConstructorArgs = '';
    const constructorAbi = params.abi.find((item: any) => item.type === 'constructor');
    if (constructorAbi?.inputs?.length && Object.keys(params.constructorArgs).length > 0) {
      const types = constructorAbi.inputs.map((i: any) => i.type);
      const values = constructorAbi.inputs.map((i: any) => params.constructorArgs[i.name]);
      const abiCoder = new ethers.AbiCoder();
      encodedConstructorArgs = abiCoder.encode(types, values).slice(2); // remove 0x prefix
    }

    // Submit verification request
    const body = new URLSearchParams({
      apikey: this.basescanApiKey,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: params.contractAddress,
      sourceCode: standardJsonInput,
      codeformat: 'solidity-standard-json-input',
      contractname: `${sourceFile}:${params.contractName}`,
      compilerversion: params.compilerVersion,
      constructorArguements: encodedConstructorArgs,
    });

    const submitRes = await fetch('https://api-sepolia.basescan.org/api', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const submitData = await submitRes.json();

    if (submitData.status !== '1') {
      this.logger.warn(`Basescan verification submit failed: ${submitData.result}`);
      return;
    }

    const guid = submitData.result;
    this.logger.log(`Basescan verification submitted, GUID: ${guid}`);

    // Poll for verification result (max 5 attempts, 3s apart)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const checkRes = await fetch(
        `https://api-sepolia.basescan.org/api?apikey=${this.basescanApiKey}&module=contract&action=checkverifystatus&guid=${guid}`,
      );
      const checkData = await checkRes.json();

      if (checkData.result === 'Pass - Verified') {
        this.logger.log(`Contract ${params.contractAddress} verified on Basescan`);
        return;
      }

      if (checkData.result !== 'Pending in queue') {
        this.logger.warn(`Basescan verification failed: ${checkData.result}`);
        return;
      }
    }

    this.logger.warn(`Basescan verification timed out for ${params.contractAddress}`);
  } catch (error) {
    this.logger.error(`Basescan verification error: ${(error as Error).message}`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern=blockchain.service.spec -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/blockchain/blockchain.service.ts src/blockchain/blockchain.service.spec.ts
git commit -m "feat: add verifyContract method to BlockchainService"
```

---

### Task 3: Update deploy methods to return verification data

**Files:**
- Modify: `src/blockchain/blockchain.service.ts`

Currently `deployToken` and `deployCustomContract` return only `{ contractAddress }`. To call `verifyContract` from the callers, they need `sources`, `compilerVersion`, and `abi`. Rather than changing the return types (which would break callers), the callers already have `sources` — they just need `compilerVersion` and `abi`.

**Approach:** Update the return interfaces and methods to also return `compilerVersion` and `abi`.

**Step 1: Update interfaces**

```typescript
export interface DeployTokenResult {
  contractAddress: string;
  compilerVersion: string;
  abi: any[];
  sources: Record<string, { content: string }>;
}

export interface DeployCustomContractResult {
  contractAddress: string;
  compilerVersion: string;
  abi: any[];
}
```

**Step 2: Update deployToken to return extra fields**

In the `deployToken` method, change the return to include all fields:

```typescript
return { contractAddress, compilerVersion, abi, sources: { 'ERC20Token.sol': { content: this.erc20Source } } };
```

You also need to destructure `compilerVersion` from `this.solcService.compile(...)`:

```typescript
const { abi, bytecode, compilerVersion } = this.solcService.compile(
  { 'ERC20Token.sol': { content: this.erc20Source } },
  'ERC20Token',
);
```

**Step 3: Update deployCustomContract to return extra fields**

```typescript
const { abi, bytecode, compilerVersion } = this.solcService.compile(sources, contractName);
// ... rest of method unchanged ...
return { contractAddress, compilerVersion, abi };
```

**Step 4: Update tests — the mock compile should now return compilerVersion**

In `src/blockchain/blockchain.service.spec.ts`, update the mock:

```typescript
const mockSolcService = {
  compile: jest.fn().mockReturnValue({
    abi: [{ type: 'constructor', inputs: [] }],
    bytecode: '0x6080',
    compilerVersion: 'v0.8.28+commit.7893614a',
  }),
};
```

Update the deploy assertions to check for the new fields:

```typescript
// deployToken test:
expect(result).toEqual({
  contractAddress: '0xabc123',
  compilerVersion: 'v0.8.28+commit.7893614a',
  abi: [{ type: 'constructor', inputs: [] }],
  sources: { 'ERC20Token.sol': { content: 'pragma solidity ^0.8.20;' } },
});

// deployCustomContract test:
expect(result).toEqual({
  contractAddress: '0xabc123',
  compilerVersion: 'v0.8.28+commit.7893614a',
  abi: [{ type: 'constructor', inputs: [] }],
});
```

**Step 5: Run tests**

Run: `npx jest --testPathPattern=blockchain.service.spec -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/blockchain/blockchain.service.ts src/blockchain/blockchain.service.spec.ts
git commit -m "feat: return compilerVersion and abi from deploy methods"
```

---

### Task 4: Wire verification into MarketplaceService.redeploy()

**Files:**
- Modify: `src/marketplace/marketplace.service.ts`

**Step 1: Add verification calls after each deploy path**

In `MarketplaceService.redeploy()`, after each deploy branch, call `verifyContract` fire-and-forget. The `result` object now includes `compilerVersion` and `abi`.

For the ERC20 branch:

```typescript
if (template.type === TokenType.ERC20 && template.template === 'erc20') {
  const result = await this.blockchainService.deployToken(
    constructorArgs.name || 'Token',
    constructorArgs.symbol || 'TKN',
    Number(constructorArgs.totalSupply) || 1000000,
    user.walletMnemonic,
  );
  contractAddress = result.contractAddress;

  // Fire-and-forget verification
  this.blockchainService
    .verifyContract({
      contractAddress,
      sources: result.sources,
      contractName: 'ERC20Token',
      compilerVersion: result.compilerVersion,
      constructorArgs,
      abi: result.abi,
    })
    .catch((err) => this.logger.error('Verification failed', err.stack));
}
```

For the custom contract branch:

```typescript
else {
  const result = await this.blockchainService.deployCustomContract(
    template.sources,
    template.contractName,
    constructorArgs,
    user.walletMnemonic,
  );
  contractAddress = result.contractAddress;

  // Fire-and-forget verification
  this.blockchainService
    .verifyContract({
      contractAddress,
      sources: template.sources,
      contractName: template.contractName,
      compilerVersion: result.compilerVersion,
      constructorArgs,
      abi: result.abi,
    })
    .catch((err) => this.logger.error('Verification failed', err.stack));
}
```

**Step 2: Run full test suite to check nothing is broken**

Run: `npx jest -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/marketplace/marketplace.service.ts
git commit -m "feat: add Basescan verification to marketplace redeploy"
```

---

### Task 5: Wire verification into ContractsController.deploy()

**Files:**
- Modify: `src/contracts/contracts.controller.ts`

**Step 1: Add verification after ERC20 deploy**

After the `deployToken` call in the ERC20 branch (around line 66), add fire-and-forget verification:

```typescript
const result = await this.blockchainService.deployToken(
  dto.params.name,
  dto.params.symbol,
  dto.params.totalSupply,
  user.walletMnemonic,
);

// Fire-and-forget verification
this.blockchainService
  .verifyContract({
    contractAddress: result.contractAddress,
    sources: result.sources,
    contractName: 'ERC20Token',
    compilerVersion: result.compilerVersion,
    constructorArgs: {
      _name: dto.params.name,
      _symbol: dto.params.symbol,
      _totalSupply: String(dto.params.totalSupply),
    },
    abi: result.abi,
  })
  .catch((err) => this.logger.error('Verification failed', err.stack));
```

**Step 2: Add verification after custom contract deploy**

After the `deployCustomContract` call (around line 108):

```typescript
const result = await this.blockchainService.deployCustomContract(
  dto.sources,
  dto.contractName,
  dto.constructorArgs || {},
  user.walletMnemonic,
);

// Fire-and-forget verification
this.blockchainService
  .verifyContract({
    contractAddress: result.contractAddress,
    sources: dto.sources,
    contractName: dto.contractName,
    compilerVersion: result.compilerVersion,
    constructorArgs: dto.constructorArgs || {},
    abi: result.abi,
  })
  .catch((err) => this.logger.error('Verification failed', err.stack));
```

**Step 3: Run tests**

Run: `npx jest -v`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/contracts/contracts.controller.ts
git commit -m "feat: add Basescan verification to contracts deploy"
```

---

### Task 6: Wire verification into ToolDispatchService (AI chat deploy)

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts`

**Step 1: Add verification after deployERC20**

In the `deployERC20` case (around line 181), after the deploy:

```typescript
const result = await this.blockchainService.deployToken(
  args.name,
  args.symbol,
  args.totalSupply,
  mnemonic,
);

// Fire-and-forget verification
this.blockchainService
  .verifyContract({
    contractAddress: result.contractAddress,
    sources: result.sources,
    contractName: 'ERC20Token',
    compilerVersion: result.compilerVersion,
    constructorArgs: {
      _name: args.name,
      _symbol: args.symbol,
      _totalSupply: String(args.totalSupply),
    },
    abi: result.abi,
  })
  .catch((err) => this.logger.error('Verification failed', err.stack));
```

**Step 2: Add verification after deployCustomContract**

In the `deployCustomContract` case (around line 249), after the deploy:

```typescript
const result = await this.blockchainService.deployCustomContract(
  sources,
  contractName,
  constructorArgs,
  mnemonic,
);

// Fire-and-forget verification
this.blockchainService
  .verifyContract({
    contractAddress: result.contractAddress,
    sources,
    contractName,
    compilerVersion: result.compilerVersion,
    constructorArgs,
    abi: result.abi,
  })
  .catch((err) => this.logger.error('Verification failed', err.stack));
```

**Step 3: Run tests**

Run: `npx jest -v`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: add Basescan verification to AI chat deploy"
```

---

### Task 7: Add BASESCAN_API_KEY to .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Add the environment variable**

Add after the `BASE_SEPOLIA_RPC_URL` line:

```
# Basescan Verification (free key from basescan.org/myapikey)
BASESCAN_API_KEY=your-basescan-api-key
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add BASESCAN_API_KEY to .env.example"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx jest -v`
Expected: ALL PASS

**Step 2: Build the project**

Run: `npm run build`
Expected: Builds without errors

**Step 3: Verify lint passes**

Run: `npm run lint`
Expected: No errors
