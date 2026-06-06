# Solidity Post-Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic post-processing to `handleChat()` so that Solidity code written as text by the AI is automatically compiled, constructor args extracted, and PendingDeployCard shown — regardless of whether `generateContract` tool was called.

**Architecture:** Single-file backend change in `tool-dispatch.service.ts`. Add `extractSolidityFromText()` helper and post-processing block after the tool loop. No frontend changes.

**Tech Stack:** NestJS, solc-js, TypeScript

---

### Task 1: Add `extractSolidityFromText` helper method

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts`

**Step 1: Add the helper method after `extractContractName`**

Add this method to `ToolDispatchService` class, after the existing `extractContractName` method (after line 357):

```typescript
private extractSolidityFromText(text: string): string | null {
  const match = text.match(/```solidity\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  const code = match[1].trim();
  if (/pragma solidity/.test(code) && /\bcontract\s+\w+/.test(code)) {
    return code;
  }
  return null;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: add extractSolidityFromText helper for post-processing"
```

---

### Task 2: Add post-processing block in `handleChat`

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts`

**Step 1: Track whether generateContract was called via tool**

In `handleChat()`, add a `usedGenerateTool` flag. Initialize it to `false` before the tool loop (after line 126). Inside the tool loop, set it to `true` when `toolCall.name === 'generateContract'` is encountered.

Replace the tool loop section (lines 135-155) with:

```typescript
let usedGenerateTool = false;

while (response.toolCalls.length > 0) {
  for (const toolCall of response.toolCalls) {
    if (toolCall.name === 'generateContract') {
      usedGenerateTool = true;
    }
    const args = JSON.parse(toolCall.arguments);
    const output = await this.dispatchToolCall(
      toolCall.name,
      args,
      user.walletMnemonic,
      userId,
      projectId,
      deployments,
      pendingDeploys,
    );

    response = await this.openAiService.submitToolOutput(
      response.responseId,
      toolCall.id,
      JSON.stringify(output),
      tools,
    );
  }
}
```

**Step 2: Add post-processing after the tool loop**

After the while loop ends (before the return statement), add:

```typescript
// Post-process: if AI wrote Solidity as text instead of calling generateContract
if (!usedGenerateTool && deployments.length === 0) {
  const extractedCode = this.extractSolidityFromText(response.outputText);
  if (extractedCode) {
    this.logger.log(
      'Detected Solidity code in response text — running post-process compilation',
    );
    const contractName = this.extractContractName(extractedCode);
    const fileName = `${contractName}.sol`;
    const sources = { [fileName]: { content: extractedCode } };

    try {
      const schema = this.blockchainService.getConstructorArgsSchema(
        sources,
        contractName,
      );
      await this.generatedContractService.save(
        userId,
        sources,
        contractName,
        schema,
      );
      if (Object.keys(schema).length > 0) {
        pendingDeploys.push({
          contractName,
          constructorArgs: schema,
        });
      }
    } catch (e) {
      this.logger.warn(
        `Post-process compilation failed: ${(e as Error).message}`,
      );
    }
  }
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Compiles with no errors

**Step 4: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: add post-processing to extract constructor args from inline Solidity"
```

---

### Task 3: Live browser test

**Step 1: Restart backend**

Run: `npm run start:dev`

**Step 2: Open frontend and test**

1. Navigate to `http://localhost:3000/chat`
2. Log in as `seed@chaincraft.dev / password123`
3. Open a new chat
4. Send: "Create a token sale contract that takes an owner address, a token price in uint256, and an end time in uint256 as constructor parameters"
5. Wait for response

**Step 3: Verify result**

Expected: Whether the AI calls `generateContract` tool OR writes code as text, the PendingDeployCard should appear with 3 fields: owner_ (address), tokenPrice_ (uint256), endTime_ (uint256).

**Step 4: Test deployment**

1. Fill in: owner_ = `0x16850b149B5bD41aAE55a83c1364a11E36956cB9`, tokenPrice_ = `1000`, endTime_ = `1893456000`
2. Click "Deploy Contract"
3. Verify deployment succeeds (DeploymentCard appears)

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: post-processing adjustments from live testing"
```
