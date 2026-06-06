# Custom Contract Deploy Fix — Design

**Date:** 2026-02-26
**Status:** Approved
**Branch:** feature/coinbase-sdk-upgrade

## Problem

When a user asks the AI chat to deploy a custom contract (e.g. "create a voting contract"), `deployCustomContract` tool is called but `sources` parameter arrives empty or malformed at the solc compiler, causing: `"Solidity compilation failed: No input sources specified"`.

Root cause: No validation on `sources` anywhere in the chain (`ToolDispatchService → BlockchainService → SolcService`), and no mechanism for the AI to show the code before deploying.

## Solution: Two-Phase Tool Flow + Validation

### Two-Phase Flow

**New tool: `generateContract`**
- AI generates Solidity code and returns it structured as `{ sources, contractName, constructorArgs }`
- Backend does NOT compile or deploy — just returns the sources back
- AI shows the code to the user and asks for deploy confirmation

**Existing tool: `deployCustomContract`**
- No parameter changes
- AI calls this when user confirms deploy, or when user directly asks to deploy

### Intent Detection (System Prompt)

- "Create / generate / write a contract" → AI calls `generateContract` first, shows code, waits for confirmation
- "Deploy a contract" → AI calls `deployCustomContract` directly
- Both paths require AI to put valid Solidity code in `sources`

### Validation Layer

Add validation in `ToolDispatchService` before calling `BlockchainService.deployCustomContract`:

- `sources` must be a non-empty object
- Each key must be a `.sol` filename
- Each value must have a `content` string field
- `contractName` must be a non-empty string

On failure, return a clear error message the AI can relay to the user.

## Files to Modify

| File | Change |
|------|--------|
| `src/openai/tool-dispatch.service.ts` | Add `generateContract` tool definition, add `sources` validation for `deployCustomContract`, update system prompt |
| `src/openai/tool-dispatch.service.spec.ts` | Add tests for new tool and validation |

## Chat Flow Examples

**Onaylı akış:**
```
User: "Create a voting contract"
AI: [calls generateContract] → shows Solidity code → "Deploy etmemi ister misin?"
User: "Evet"
AI: [calls deployCustomContract] → returns contract address
```

**Direkt deploy:**
```
User: "Deploy a voting contract"
AI: [calls deployCustomContract] → returns contract address
```

**Validation hata:**
```
User: "Deploy a contract" (AI malforms sources)
AI: [calls deployCustomContract] → validation catches empty sources → AI reports error clearly
```
