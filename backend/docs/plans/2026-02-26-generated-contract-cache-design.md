# Generated Contract Cache — Design

**Date:** 2026-02-26
**Status:** Approved
**Branch:** feature/coinbase-sdk-upgrade

## Problem

In the two-phase contract flow (generate → confirm → deploy), the AI calls `generateContract` which returns structured sources. When the user says "deploy it", the AI calls `deployCustomContract` but fails to copy the large Solidity source code into the `sources` parameter. This causes "No input sources specified" errors.

## Solution: MongoDB Cache with TTL

Store the last generated contract per user in MongoDB with a TTL index. When `deployCustomContract` receives empty/invalid sources, fall back to the cached contract.

### GeneratedContract Schema

New Mongoose schema in `OpenAiModule`:

```
GeneratedContract:
  - userId: ObjectId (ref SmartUser, indexed)
  - sources: Object ({ "File.sol": { content: "..." } })
  - contractName: String
  - constructorArgs: Object
  - createdAt: Date (TTL index — 1 hour expiry)
```

MongoDB TTL index auto-deletes documents after 1 hour. Each `generateContract` call deletes the user's previous entry and writes a new one — one cached contract per user at a time.

### File Structure

New files (in OpenAiModule — sole consumer is ToolDispatchService):
- `src/openai/schemas/generated-contract.schema.ts` — Mongoose schema + TTL index
- `src/openai/generated-contract.service.ts` — save/findByUser/deleteByUser

### ToolDispatchService Changes

**`generateContract` case:**
1. Generate code via `openAiService.generateContract(description)`
2. Extract contract name
3. Save to MongoDB via `generatedContractService.save(userId, sources, contractName)`
4. Return structured `{ sources, contractName, constructorArgs }` to AI

**`deployCustomContract` case:**
1. Validate `args.sources`
2. If valid → deploy directly (existing flow)
3. If invalid → `generatedContractService.findByUser(userId)`
   - Found → deploy with cached sources + user's constructorArgs
   - Not found → return error

### System Prompt Update

Add to CHAT_SYSTEM_PROMPT:
- "When deploying after generateContract, you can call deployCustomContract with empty sources — the backend will use the previously generated contract."

### Multi-User Safety

Each cache entry is keyed by `userId`. Concurrent users never share cache entries. TTL is per-document.

### Chat Flow Examples

**Two-phase (generate → deploy):**
```
"Create a voting contract" → generateContract → saves to cache → shows code
"Deploy it" → deployCustomContract (sources empty) → cache hit → deploys
```

**Two-phase with args:**
```
"Create a voting contract" → generates + caches
"Deploy it with owner 0xABC" → deployCustomContract (sources empty, constructorArgs filled) → cache hit → deploys with args
```

**Direct deploy:**
```
"Deploy a voting contract" → deployCustomContract (sources filled by AI) → deploys directly, no cache needed
```
