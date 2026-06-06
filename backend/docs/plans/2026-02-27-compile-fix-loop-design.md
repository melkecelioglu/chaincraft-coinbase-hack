# Compile-Fix Loop for AI-Generated Contracts

**Date:** 2026-02-27
**Status:** Approved

## Problem

When the AI generates Solidity code via `generateContract` (or writes it inline), the code sometimes has compilation errors. The current flow:

1. AI generates Solidity code
2. `getConstructorArgsSchema()` tries to compile — **fails**
3. Error is silently caught (try-catch at tool-dispatch.service.ts:370), schema stays `{}`
4. Broken code is saved to GeneratedContract cache anyway
5. `pendingDeploys` not populated (empty schema) — **deploy card doesn't appear**
6. AI reads constructor from its own code text, tells user about it
7. User provides constructor args manually, asks to deploy
8. `deployCustomContract` loads broken code from cache → compile fails → **error surfaces**

Result: User goes through a multi-step flow only to hit a compilation error at the end.

## Solution: Compile-Fix Loop

After AI generates code, compile it. If compilation fails, automatically ask the AI to fix the error and retry. Only save successfully compiled code to the cache.

### Flow

```
generateContract called
  → AI generates Solidity code
  → Try compile (getConstructorArgsSchema)
  → SUCCESS → save to cache + return schema → done
  → FAIL → call fixCompilationError(code, error)
         → AI returns fixed code
         → Try compile again
         → SUCCESS → save to cache + return schema
         → FAIL → retry (max 2 fix attempts)
                → Still fails → DON'T save to cache
                              → return { error } in tool output
                              → AI explains to user
```

### Key Rules

- **Max retries:** 2 fix attempts (total 3 compilation tries: original + 2 fixes)
- **Broken code never enters cache** — only successfully compiled code is saved
- **Error returned to AI** if all retries exhausted — AI informs user transparently
- **Post-process fallback** gets the same loop (for when AI writes Solidity as text)
- **Constructor prompt preserved** — fix prompt instructs AI to not change constructor signature

## Implementation Details

### New method: `OpenAiService.fixCompilationError()`

```typescript
async fixCompilationError(
  originalCode: string,
  compilationError: string,
): Promise<string>
```

- Prompt: "Fix ONLY the compilation error, do not change the contract's functionality or constructor signature."
- Uses same model (gpt-5.2) as `generateContract`
- Returns fixed Solidity code (extracted from markdown blocks)

### New helper: `ToolDispatchService.compileWithRetry()`

```typescript
private async compileWithRetry(
  code: string,
  contractName: string,
  maxRetries: number = 2,
): Promise<{
  sources: Record<string, { content: string }>;
  schema: Record<string, { type: string }>;
} | { error: string }>
```

- Attempts compilation
- On failure: calls `fixCompilationError()`, updates sources, retries
- Returns compiled result with schema on success, or error string on exhaustion

### Changed: `generateContract` case (tool-dispatch.service.ts)

- Replace try-catch around `getConstructorArgsSchema` with `compileWithRetry()`
- Only save to cache and populate `pendingDeploys` on success
- Return `{ error }` on failure (AI gets the error as tool output)

### Changed: Post-process fallback (tool-dispatch.service.ts)

- Replace try-catch around `getConstructorArgsSchema` with `compileWithRetry()`
- Only save to cache and populate `pendingDeploys` on success
- On failure: skip (no cache, no pendingDeploys — AI's text already shown)

### Unchanged

- `deployCustomContract` flow (cache will only contain valid code now)
- `deployERC20` flow (hardcoded contract)
- Frontend deploy card rendering logic
- Marketplace / Basescan verification flows

## Trade-offs

- **Latency:** +2-5 seconds per retry (extra OpenAI call). Invisible to user.
- **Cost:** Extra tokens for fix calls. Expected to be rare (~10-20% of generates).
- **Reliability:** Not 100% — some errors may be unfixable in 2 retries. Transparent failure via tool output.
