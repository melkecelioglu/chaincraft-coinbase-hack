# Compile-Fix Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-fix AI-generated Solidity compilation errors before caching, so only valid contracts reach the deploy card and deploy flow.

**Architecture:** Add `fixCompilationError()` to OpenAiService, add `compileWithRetry()` helper to ToolDispatchService, replace silent try-catch in both `generateContract` and post-process fallback paths.

**Tech Stack:** NestJS, OpenAI Responses API (gpt-5.2), solc-js, Jest

---

### Task 1: Add `fixCompilationError` method to OpenAiService

**Files:**
- Modify: `src/openai/openai.service.ts`
- Test: `src/openai/openai.service.spec.ts`

**Step 1: Write the failing test**

In `src/openai/openai.service.spec.ts`, add a new `describe('fixCompilationError')` block after the existing `describe('generateContract')` block (after line 204):

```typescript
describe('fixCompilationError', () => {
  it('should send original code and error to AI and return fixed code', async () => {
    const mockResponse = {
      output_text:
        '```solidity\n// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Fixed { function _exists(uint256 id) internal pure returns (bool) { return id > 0; } }\n```',
    };
    mockCreate(service).mockResolvedValue(mockResponse);

    const result = await service.fixCompilationError(
      'contract Broken { function _exists() {} function _exists(uint256) {} }',
      'TypeError: No unique declaration found',
    );
    expect(result).toContain('contract Fixed');
    expect(result).not.toContain('```');
    expect(mockCreate(service)).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('Fix ONLY the compilation error'),
        input: expect.stringContaining('TypeError: No unique declaration found'),
      }),
    );
  });

  it('should return raw text if no code block in response', async () => {
    const mockResponse = {
      output_text:
        '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Fixed {}',
    };
    mockCreate(service).mockResolvedValue(mockResponse);

    const result = await service.fixCompilationError('broken code', 'some error');
    expect(result).toContain('contract Fixed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern=openai.service.spec --verbose`
Expected: FAIL — `service.fixCompilationError is not a function`

**Step 3: Write the implementation**

In `src/openai/openai.service.ts`, add a constant after `CONTRACT_ENRICHMENT_PROMPT` (after line 40):

```typescript
const COMPILATION_FIX_PROMPT =
  `You are a Solidity compiler error fixer. Fix ONLY the compilation error in the provided code.
Rules:
1. Do NOT change the contract's functionality or constructor signature
2. Do NOT add or remove constructor parameters
3. Do NOT rename the contract
4. Fix ONLY what the compiler error identifies
5. Return ONLY the fixed Solidity code, no explanations`.trim();
```

Then add the method to the `OpenAiService` class, after `generateContract` (after line 145):

```typescript
async fixCompilationError(
  originalCode: string,
  compilationError: string,
): Promise<string> {
  const response = await this.callApi({
    model: MODEL,
    instructions: COMPILATION_FIX_PROMPT,
    input: `The following Solidity code has a compilation error:\n\n\`\`\`solidity\n${originalCode}\n\`\`\`\n\nCompilation error:\n${compilationError}\n\nReturn the fixed code.`,
  });

  const text = response.output_text;
  const codeMatch =
    text.match(/```solidity\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/);

  return (codeMatch?.[1] ?? text).trim();
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern=openai.service.spec --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/openai/openai.service.ts src/openai/openai.service.spec.ts
git commit -m "feat: add fixCompilationError method to OpenAiService"
```

---

### Task 2: Add `compileWithRetry` helper to ToolDispatchService

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts`
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Write the failing tests**

In `src/openai/tool-dispatch.service.spec.ts`, add `fixCompilationError` to `mockOpenAiService` (line 13, add after `analyzeContract`):

```typescript
fixCompilationError: jest.fn(),
```

Add `getConstructorArgsSchema` to `mockBlockchainService` (after line 20, before the closing brace):

```typescript
getConstructorArgsSchema: jest.fn(),
```

Then add a new `describe('compileWithRetry')` block after the existing `describe('getTools')` block (after line 341):

```typescript
describe('compileWithRetry (via generateContract)', () => {
  beforeEach(() => {
    mockAuthService.getUserById.mockResolvedValue({
      walletMnemonic: 'test mnemonic',
    });
  });

  it('should compile successfully on first attempt and save to cache', async () => {
    mockOpenAiService.chat.mockResolvedValue({
      responseId: 'resp_1',
      outputText: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'generateContract',
          arguments: '{"contractDescription":"a token vesting contract"}',
        },
      ],
    });
    mockOpenAiService.generateContract.mockResolvedValue(
      'pragma solidity ^0.8.0;\n\ncontract Vesting {\n  constructor(address token_) {}\n}',
    );
    mockBlockchainService.getConstructorArgsSchema.mockReturnValue({
      token_: { type: 'address' },
    });
    mockOpenAiService.submitToolOutput.mockResolvedValue({
      responseId: 'resp_2',
      outputText: 'Here is your contract',
      toolCalls: [],
    });

    const result = await service.handleChat('Create vesting contract', 'user-id');
    expect(mockGeneratedContractService.save).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({ 'Vesting.sol': expect.any(Object) }),
      'Vesting',
      { token_: { type: 'address' } },
    );
    expect(result.pendingDeploys).toHaveLength(1);
    expect(result.pendingDeploys[0].contractName).toBe('Vesting');
    expect(mockOpenAiService.fixCompilationError).not.toHaveBeenCalled();
  });

  it('should retry with fixCompilationError when first compile fails', async () => {
    mockOpenAiService.chat.mockResolvedValue({
      responseId: 'resp_1',
      outputText: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'generateContract',
          arguments: '{"contractDescription":"a broken contract"}',
        },
      ],
    });
    mockOpenAiService.generateContract.mockResolvedValue(
      'pragma solidity ^0.8.0;\n\ncontract Broken {\n  function _exists() {} function _exists(uint256) {}\n}',
    );
    mockBlockchainService.getConstructorArgsSchema
      .mockImplementationOnce(() => {
        throw new Error('TypeError: No unique declaration found');
      })
      .mockReturnValueOnce({});
    mockOpenAiService.fixCompilationError.mockResolvedValue(
      'pragma solidity ^0.8.0;\n\ncontract Broken {\n  function _exists(uint256 id) internal pure returns (bool) { return id > 0; }\n}',
    );
    mockOpenAiService.submitToolOutput.mockResolvedValue({
      responseId: 'resp_2',
      outputText: 'Here is your fixed contract',
      toolCalls: [],
    });

    await service.handleChat('Create contract', 'user-id');
    expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledTimes(1);
    expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledWith(
      expect.stringContaining('contract Broken'),
      'TypeError: No unique declaration found',
    );
    expect(mockGeneratedContractService.save).toHaveBeenCalled();
  });

  it('should return error when all compile retries exhausted', async () => {
    mockOpenAiService.chat.mockResolvedValue({
      responseId: 'resp_1',
      outputText: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'generateContract',
          arguments: '{"contractDescription":"unfixable contract"}',
        },
      ],
    });
    mockOpenAiService.generateContract.mockResolvedValue(
      'pragma solidity ^0.8.0;\n\ncontract Unfixable {}',
    );
    mockBlockchainService.getConstructorArgsSchema.mockImplementation(() => {
      throw new Error('Persistent compilation error');
    });
    mockOpenAiService.fixCompilationError.mockResolvedValue(
      'pragma solidity ^0.8.0;\n\ncontract StillBroken {}',
    );
    mockOpenAiService.submitToolOutput.mockResolvedValue({
      responseId: 'resp_2',
      outputText: 'Sorry, could not compile',
      toolCalls: [],
    });

    await service.handleChat('Create contract', 'user-id');
    expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledTimes(2);
    expect(mockGeneratedContractService.save).not.toHaveBeenCalled();
    // Verify error was returned to AI
    const outputArg = mockOpenAiService.submitToolOutput.mock.calls[0][2];
    const parsed = JSON.parse(outputArg);
    expect(parsed.error).toContain('Persistent compilation error');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec --verbose`
Expected: FAIL — tests fail because `compileWithRetry` doesn't exist yet and current code uses try-catch

**Step 3: Write the implementation**

In `src/openai/tool-dispatch.service.ts`, add the `compileWithRetry` private method before `validateSources` (before line 404):

```typescript
private async compileWithRetry(
  code: string,
  contractName: string,
  maxRetries: number = 2,
): Promise<
  | {
      sources: Record<string, { content: string }>;
      schema: Record<string, { type: string }>;
    }
  | { error: string }
> {
  const fileName = `${contractName}.sol`;
  let currentCode = code;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const sources = { [fileName]: { content: currentCode } };
    try {
      const schema = this.blockchainService.getConstructorArgsSchema(
        sources,
        contractName,
      );
      return { sources, schema };
    } catch (e) {
      const errorMessage = (e as Error).message;
      if (attempt < maxRetries) {
        this.logger.log(
          `Compilation failed (attempt ${attempt + 1}/${maxRetries + 1}), requesting AI fix`,
        );
        currentCode = await this.openAiService.fixCompilationError(
          currentCode,
          errorMessage,
        );
        // Re-extract contract name in case AI renamed it (shouldn't happen but safety)
        const newName = this.extractContractName(currentCode);
        if (newName !== contractName) {
          this.logger.warn(
            `AI changed contract name from ${contractName} to ${newName} — using original`,
          );
        }
      } else {
        this.logger.error(
          `Compilation failed after ${maxRetries + 1} attempts: ${errorMessage}`,
        );
        return { error: `Solidity compilation failed after ${maxRetries + 1} attempts: ${errorMessage}` };
      }
    }
  }

  // Unreachable, but TypeScript needs it
  return { error: 'Unexpected compile-with-retry state' };
}
```

**Step 4: Replace `generateContract` case (lines 354-396)**

Replace the entire `case 'generateContract'` block in `dispatchToolCall`:

```typescript
case 'generateContract': {
  const code = await this.openAiService.generateContract(
    args.contractDescription,
  );
  const contractName = this.extractContractName(code);

  const compileResult = await this.compileWithRetry(code, contractName);

  if ('error' in compileResult) {
    return compileResult;
  }

  await this.generatedContractService.save(
    userId,
    compileResult.sources,
    contractName,
    compileResult.schema,
  );

  if (Object.keys(compileResult.schema).length > 0) {
    pendingDeploys.push({
      contractName,
      constructorArgs: compileResult.schema,
    });
  }

  return {
    sources: compileResult.sources,
    contractName,
    constructorArgs: compileResult.schema,
  };
}
```

**Step 5: Replace post-process fallback (lines 164-198)**

Replace the post-process try-catch block in `handleChat`:

```typescript
// Post-process: if AI wrote Solidity as text instead of calling generateContract
if (!usedGenerateTool && deployments.length === 0) {
  const extractedCode = this.extractSolidityFromText(response.outputText);
  if (extractedCode) {
    this.logger.log(
      'Detected Solidity code in response text — running post-process compilation',
    );
    const contractName = this.extractContractName(extractedCode);

    const compileResult = await this.compileWithRetry(
      extractedCode,
      contractName,
    );

    if (!('error' in compileResult)) {
      await this.generatedContractService.save(
        userId,
        compileResult.sources,
        contractName,
        compileResult.schema,
      );
      if (Object.keys(compileResult.schema).length > 0) {
        pendingDeploys.push({
          contractName,
          constructorArgs: compileResult.schema,
        });
      }
    }
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec --verbose`
Expected: PASS (all existing + new tests)

**Step 7: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: add compile-fix loop to generateContract and post-process fallback"
```

---

### Task 3: Fix existing `generateContract` test

**Files:**
- Modify: `src/openai/tool-dispatch.service.spec.ts`

The existing test `'should dispatch generateContract and return structured sources'` (line 147) doesn't mock `getConstructorArgsSchema`. With the old code, the error was silently caught. Now we need the mock to return a value or throw, since `compileWithRetry` will call `fixCompilationError` on failure.

**Step 1: Update the existing test**

In the test at line 147, add the `getConstructorArgsSchema` mock after `mockOpenAiService.generateContract` (after line 164):

```typescript
mockBlockchainService.getConstructorArgsSchema.mockReturnValue({});
```

**Step 2: Run all tests**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec --verbose`
Expected: PASS — all tests green

**Step 3: Commit**

```bash
git add src/openai/tool-dispatch.service.spec.ts
git commit -m "test: update generateContract test to mock getConstructorArgsSchema"
```

---

### Task 4: Run full test suite and verify

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Final commit (if any lint fixes needed)**

```bash
git add -u
git commit -m "fix: lint corrections for compile-fix loop"
```
