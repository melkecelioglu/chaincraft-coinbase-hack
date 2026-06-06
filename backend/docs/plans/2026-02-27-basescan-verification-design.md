# Basescan Contract Verification Design

**Date:** 2026-02-27
**Status:** Approved

## Problem

Deployed contracts are not verified/published on Basescan (Base Sepolia explorer). No verification logic exists in the codebase — this is a new feature, not a regression.

## Scope

Add automatic Basescan verification to all 3 deploy paths:
1. Marketplace redeploy (`MarketplaceService.redeploy()`)
2. Contracts deploy (`ContractsController.deploy()`)
3. AI chat deploy (`ToolDispatchService` — `deployCustomContract` + `deployToken`)

## Approach: Basescan API Direct Verification

Use Basescan's standard source code verification API (`https://api-sepolia.basescan.org/api`).

### Flow

1. Contract deploys (existing flow, unchanged)
2. Deploy succeeds → `BlockchainService.verifyContract()` called
3. Submit source code + compiler settings + constructor args to Basescan API
4. Basescan returns a GUID
5. Poll GUID for verification status (10-30 seconds typical)
6. Log result (success/failure)

### Fire-and-Forget

Verification is async and best-effort:
- Deploy response returns immediately to user
- Verification runs in background
- Failure only logged, does not affect deploy result

### Constructor Args Encoding

Basescan expects ABI-encoded hex string for constructor arguments:

```typescript
const abiCoder = new ethers.AbiCoder();
const encodedArgs = abiCoder.encode(paramTypes, paramValues);
```

### Compiler Version

solc-js provides the exact version string (e.g. `v0.8.28+commit.7893614a`). Basescan requires this exact format.

### Basescan API Parameters

```
module=contract
action=verifysourcecode
apikey=ETHERSCAN_API_KEY
contractaddress=0x...
sourceCode={...}           // Standard JSON input (same format as solc input)
codeformat=solidity-standard-json-input
contractname=ContractFile.sol:ContractName
compilerversion=v0.8.28+commit.7893614a
constructorArguements=<ABI-encoded hex>  // Note: Etherscan typo is intentional
```

## Files to Change

| File | Change |
|------|--------|
| `BlockchainService` | Add `verifyContract()` method with Basescan API calls |
| `SolcService` | Return `compilerVersion` from compile output |
| `MarketplaceService.redeploy()` | Call verify after deploy |
| `ContractsController.deploy()` | Call verify after deploy |
| `ToolDispatchService` | Call verify after deploy |
| `.env.example` | Add `BASESCAN_API_KEY` |

## Environment Variables

```
BASESCAN_API_KEY  — Etherscan/Basescan API key (free at basescan.org/myapikey)
```

## Network Configuration

- **Network:** Base Sepolia (testnet)
- **API Endpoint:** `https://api-sepolia.basescan.org/api`
- **Explorer URL:** `https://sepolia.basescan.org`
