# Custom Contract Deploy Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix "No input sources specified" error in custom contract deploy via AI chat by adding sources validation and returning structured data from `generateContract`.

**Architecture:** Update `generateContract` tool dispatch to return structured `{ sources, contractName, constructorArgs }` instead of plain string. Add validation to `deployCustomContract`. Add system instruction to chat so AI knows to use two-phase flow (generate → confirm → deploy).

**Tech Stack:** NestJS, TypeScript, OpenAI Responses API, Jest

---

### Task 1: Add sources validation to deployCustomContract

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:199-237`
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Write the failing test**

Add to `tool-dispatch.service.spec.ts` inside the `handleChat` describe block:

```typescript
it('should return error when deployCustomContract sources is empty', async () => {
  mockAuthService.getUserById.mockResolvedValue({
    walletMnemonic: 'test mnemonic',
  });
  mockOpenAiService.chat.mockResolvedValue({
    responseId: 'resp_1',
    outputText: '',
    toolCalls: [
      {
        id: 'call_1',
        name: 'deployCustomContract',
        arguments: '{"sources":{},"contractName":"A","constructorArgs":{}}',
      },
    ],
  });
  mockOpenAiService.submitToolOutput.mockResolvedValue({
    responseId: 'resp_2',
    outputText: 'Sources were empty',
    toolCalls: [],
  });

  await service.handleChat('Deploy custom', 'user-id');
  expect(mockBlockchainService.deployCustomContract).not.toHaveBeenCalled();
  expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
    'resp_1',
    'call_1',
    expect.stringContaining('sources must contain at least one .sol file'),
    expect.anything(),
  );
});

it('should return error when deployCustomContract sources has no content', async () => {
  mockAuthService.getUserById.mockResolvedValue({
    walletMnemonic: 'test mnemonic',
  });
  mockOpenAiService.chat.mockResolvedValue({
    responseId: 'resp_1',
    outputText: '',
    toolCalls: [
      {
        id: 'call_1',
        name: 'deployCustomContract',
        arguments: '{"sources":{"A.sol":{}},"contractName":"A","constructorArgs":{}}',
      },
    ],
  });
  mockOpenAiService.submitToolOutput.mockResolvedValue({
    responseId: 'resp_2',
    outputText: 'Invalid source',
    toolCalls: [],
  });

  await service.handleChat('Deploy custom', 'user-id');
  expect(mockBlockchainService.deployCustomContract).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts -v`
Expected: 2 new tests FAIL because no validation exists yet.

**Step 3: Write the validation**

In `src/openai/tool-dispatch.service.ts`, add a private validation method and call it in the `deployCustomContract` case:

```typescript
private validateSources(
  sources: unknown,
): sources is Record<string, { content: string }> {
  if (!sources || typeof sources !== 'object' || Object.keys(sources).length === 0) {
    return false;
  }
  for (const [, source] of Object.entries(sources as Record<string, any>)) {
    if (!source?.content || typeof source.content !== 'string') {
      return false;
    }
  }
  return true;
}
```

In the `deployCustomContract` case (line 199), add before the `blockchainService` call:

```typescript
case 'deployCustomContract': {
  if (!this.validateSources(args.sources)) {
    return {
      error: 'sources must contain at least one .sol file with a "content" string field',
    };
  }
  // ... existing deploy code
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts -v`
Expected: All tests PASS including 2 new ones.

**Step 5: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: add sources validation to deployCustomContract tool dispatch"
```

---

### Task 2: Return structured data from generateContract

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:239-240`
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Write the failing test**

Update the existing `generateContract` test to expect structured output:

```typescript
it('should dispatch generateContract and return structured sources', async () => {
  mockAuthService.getUserById.mockResolvedValue({
    walletMnemonic: 'test mnemonic',
  });
  mockOpenAiService.chat.mockResolvedValue({
    responseId: 'resp_1',
    outputText: '',
    toolCalls: [
      {
        id: 'call_1',
        name: 'generateContract',
        arguments: '{"contractDescription":"a simple voting contract"}',
      },
    ],
  });
  mockOpenAiService.generateContract.mockResolvedValue(
    'pragma solidity ^0.8.0;\n\ncontract Voting {\n  // voting logic\n}',
  );
  mockOpenAiService.submitToolOutput.mockResolvedValue({
    responseId: 'resp_2',
    outputText: 'Here is your contract',
    toolCalls: [],
  });

  await service.handleChat('Create voting contract', 'user-id');
  expect(mockOpenAiService.generateContract).toHaveBeenCalledWith(
    'a simple voting contract',
  );
  expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
    'resp_1',
    'call_1',
    expect.stringContaining('"sources"'),
    expect.anything(),
  );
  // Verify structured format
  const outputArg = mockOpenAiService.submitToolOutput.mock.calls[0][2];
  const parsed = JSON.parse(outputArg);
  expect(parsed.sources).toBeDefined();
  expect(parsed.contractName).toBe('Voting');
  expect(parsed.constructorArgs).toEqual({});
  expect(Object.values(parsed.sources)[0]).toHaveProperty('content');
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts -v`
Expected: FAIL because `generateContract` currently returns plain string.

**Step 3: Update the generateContract dispatch**

In `src/openai/tool-dispatch.service.ts`, replace the `generateContract` case:

```typescript
case 'generateContract': {
  const code = await this.openAiService.generateContract(
    args.contractDescription,
  );
  const contractName = this.extractContractName(code);
  const fileName = `${contractName}.sol`;
  return {
    sources: { [fileName]: { content: code } },
    contractName,
    constructorArgs: {},
  };
}
```

Add a private helper:

```typescript
private extractContractName(solidityCode: string): string {
  const match = solidityCode.match(/contract\s+(\w+)/);
  return match?.[1] ?? 'Contract';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: return structured sources from generateContract tool"
```

---

### Task 3: Add system instruction for two-phase flow

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:111-115`
- Modify: `src/openai/openai.service.ts:69-82`
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Add instructions parameter to OpenAiService.chat**

In `src/openai/openai.service.ts`, update the `chat` method signature and body:

```typescript
async chat(
  message: string,
  tools: OpenAI.Responses.Tool[],
  previousResponseId?: string,
  instructions?: string,
): Promise<ChatResponse> {
  const response = await this.callApi({
    model: MODEL,
    input: message,
    tools,
    ...(instructions && { instructions }),
    ...(previousResponseId && { previous_response_id: previousResponseId }),
  });

  return this.mapToChatResponse(response);
}
```

**Step 2: Add system prompt constant and pass it in handleChat**

In `src/openai/tool-dispatch.service.ts`, add the constant at the top of the file (after imports):

```typescript
const CHAT_SYSTEM_PROMPT = `You are a blockchain assistant that helps users create and deploy smart contracts.

Tool usage rules:
- When the user asks to "create", "generate", or "write" a contract: call generateContract first to show the code. Wait for the user to confirm before deploying.
- When the user asks to "deploy" a contract: call deployCustomContract or deployERC20 directly.
- When calling deployCustomContract, the "sources" parameter MUST be a map of filenames to objects with a "content" field containing complete Solidity source code. Example: { "MyContract.sol": { "content": "pragma solidity ^0.8.0; ..." } }
- For ERC20 tokens, prefer deployERC20 over deployCustomContract.
`.trim();
```

Update the `handleChat` method to pass the system prompt:

```typescript
let response = await this.openAiService.chat(
  message,
  tools,
  previousResponseId,
  CHAT_SYSTEM_PROMPT,
);
```

**Step 3: Update existing tests**

Update `mockOpenAiService.chat` expectations in existing tests to accept 4 arguments (the 4th being the system prompt). Since `chat` mock is `jest.fn()` it already accepts any args — just verify the system prompt is passed:

Add a new test:

```typescript
it('should pass system prompt to chat', async () => {
  mockAuthService.getUserById.mockResolvedValue({
    walletMnemonic: 'test mnemonic',
  });
  mockOpenAiService.chat.mockResolvedValue({
    responseId: 'resp_1',
    outputText: 'Hello!',
    toolCalls: [],
  });

  await service.handleChat('Hello', 'user-id');
  expect(mockOpenAiService.chat).toHaveBeenCalledWith(
    'Hello',
    expect.any(Array),
    undefined,
    expect.stringContaining('blockchain assistant'),
  );
});
```

**Step 4: Run all tests**

Run: `npx jest -v`
Expected: All suites pass.

**Step 5: Commit**

```bash
git add src/openai/openai.service.ts src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: add system prompt for two-phase contract flow"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run all tests**

```bash
npm test
```

Expected: 10 suites, 71+ tests, all passing.

**Step 2: Build**

```bash
npx nest build
```

Expected: No errors.

**Step 3: Smoke test (manual)**

Start the backend and test via curl:

```bash
npm run start:dev &
# Wait for startup

# Login
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seed@chaincraft.dev","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Test generate flow
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Create a simple voting contract"}'

# Expected: AI shows Solidity code, asks for confirmation
```
