# Constructor Args Collection Card Design

## Problem

When AI generates contracts with constructor parameters (e.g., Ownable's `chairperson`, voting's `startTs`/`endTs`), the chat flow has no mechanism to collect these values from the user before deployment. The `generateContract` tool caches `constructorArgs: {}` (empty), and `deployCustomContract` passes empty strings to ethers.js, causing `UNCONFIGURED_NAME` errors.

## Solution: Backend-Driven Form Card

After AI generates a contract, the backend compiles it to extract the ABI, reads constructor parameter names/types, and returns a `pendingDeploys` schema in the chat response. The frontend renders a form card (reusing the marketplace `deploy-form.tsx` pattern) where the user fills in constructor values, then deploys via chat.

## Data Flow

```
User: "Deploy a voting contract"
→ AI calls generateContract
→ Backend: generates code → solc compile → extract constructor ABI
→ Response: { message, pendingDeploys: [{ contractName, constructorArgs: { param: { type } } }] }
→ Frontend: PendingDeployCard renders form fields
→ User fills form, clicks "Deploy"
→ Chat sends deployCustomContract with filled args
→ Backend: uses cached sources + user args → ethers deploy
→ Response: { deployments: [{ contractAddress }] }
→ Frontend: DeploymentCard shows result
```

## Backend Changes

### 1. `tool-dispatch.service.ts` — `generateContract` case

After AI generates code and before returning:
- Compile with `solcService.compile()` to get ABI
- Extract constructor inputs from ABI: `abi.find(item => item.type === 'constructor')?.inputs`
- Build `constructorArgs` schema: `{ paramName: { type: "address" | "uint256" | ... } }`
- Cache schema alongside sources in `generatedContractService.save()`
- Add to response as `pendingDeploy`

### 2. `ChatResult` interface update

```typescript
export interface ChatResult {
  message: string;
  responseId: string;
  deployments: Array<{ contractAddress: string; tokenId: string; type: string }>;
  pendingDeploys: Array<{
    contractName: string;
    constructorArgs: Record<string, { type: string }>;
  }>;
}
```

### 3. `blockchain.service.ts` — validation

Add validation before deploy: if any required constructor arg is missing/empty, throw a descriptive error instead of passing `''` to ethers.

## Frontend Changes

### 1. New component: `PendingDeployCard`

Based on marketplace `deploy-form.tsx`:
- Receives `{ contractName, constructorArgs }` schema
- Renders dynamic form fields per parameter (label = param name, hint = Solidity type)
- "Deploy" button triggers `chatStore.deployFromCard(contractName, filledArgs)`

### 2. `MessageBubble` update

- Check `message.pendingDeploys` array
- Render `PendingDeployCard` for each pending deploy
- Card becomes disabled after successful deployment

### 3. `ChatStore` update

- Parse `pendingDeploys` from API response
- Add `deployFromCard(contractName, constructorArgs)` action
- Sends chat message that triggers `deployCustomContract` with the user-provided args

### 4. Types update (`lib/types.ts`)

```typescript
export interface PendingDeploy {
  contractName: string;
  constructorArgs: Record<string, { type: string }>;
}

// Add to LocalMessage:
pendingDeploys?: PendingDeploy[];
```

## Error Handling

- If compilation fails during `generateContract` (e.g., import errors), return the contract code without `pendingDeploy` — AI can still describe the contract
- If a constructor has no parameters, skip the form card entirely and deploy directly (or show a confirmation-only card)
- Validate all args are filled before enabling the Deploy button
