# Constructor Args Collection Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a form card to the chat flow that collects constructor parameters from the user before deploying AI-generated contracts.

**Architecture:** Backend extracts constructor arg schema from the compiled ABI after `generateContract`, returns it as `pendingDeploys` in the chat response. Frontend renders a `PendingDeployCard` form. User fills args and clicks Deploy, which sends a chat message triggering `deployCustomContract` with the filled args.

**Tech Stack:** NestJS (backend), Next.js + React + Tailwind + shadcn/ui (frontend), solc-js, ethers.js, Zustand (state)

---

### Task 1: Backend — Update ChatResult interface and handleChat response

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:20-28` (ChatResult interface)
- Modify: `src/openai/tool-dispatch.service.ts:112-155` (handleChat method)

**Step 1: Update the ChatResult interface**

In `src/openai/tool-dispatch.service.ts`, find the `ChatResult` interface (around line 20) and add `pendingDeploys`:

```typescript
export interface ChatResult {
  message: string;
  responseId: string;
  deployments: Array<{
    contractAddress: string;
    tokenId: string;
    type: string;
    name?: string;
    symbol?: string;
    totalSupply?: number;
  }>;
  pendingDeploys: Array<{
    contractName: string;
    constructorArgs: Record<string, { type: string }>;
  }>;
}
```

**Step 2: Initialize pendingDeploys in handleChat**

In the `handleChat` method, find where `deployments` array is initialized (around line 118) and add `pendingDeploys`:

```typescript
const deployments: ChatResult['deployments'] = [];
const pendingDeploys: ChatResult['pendingDeploys'] = [];
```

Pass `pendingDeploys` to `dispatchToolCall` and include it in the return value (around line 150):

```typescript
return {
  message: finalMessage,
  responseId: response.id,
  deployments,
  pendingDeploys,
};
```

**Step 3: Run build to verify**

Run: `npm run build`
Expected: Compiles successfully (dispatchToolCall will need updating in Task 2)

**Step 4: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: add pendingDeploys to ChatResult interface"
```

---

### Task 2: Backend — Extract constructor args schema from ABI in generateContract

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:274-290` (generateContract case in dispatchToolCall)

**Step 1: Update dispatchToolCall signature to accept pendingDeploys**

In `dispatchToolCall` method (around line 157), add `pendingDeploys` to the parameters:

```typescript
private async dispatchToolCall(
  toolName: string,
  args: any,
  mnemonic: string,
  userId: string,
  projectId: string | undefined,
  deployments: ChatResult['deployments'],
  pendingDeploys: ChatResult['pendingDeploys'],
): Promise<Record<string, any>> {
```

Update the call site in `handleChat` accordingly.

**Step 2: Modify the generateContract case**

Find the `generateContract` case (around line 274). After extracting sources and contractName, compile to get ABI and extract constructor args schema:

```typescript
case 'generateContract': {
  const code = await this.openAiService.generateContract(
    args.contractDescription,
  );
  const contractName = this.extractContractName(code);
  const fileName = `${contractName}.sol`;
  const sources = { [fileName]: { content: code } };

  // Try to extract constructor args schema from ABI
  let constructorArgsSchema: Record<string, { type: string }> = {};
  try {
    const { abi } = this.solcService.compile(sources, contractName);
    const constructorAbi = abi.find(
      (item: any) => item.type === 'constructor',
    );
    if (constructorAbi?.inputs?.length > 0) {
      for (const input of constructorAbi.inputs) {
        constructorArgsSchema[input.name] = { type: input.type };
      }
    }
  } catch (e) {
    this.logger.warn(`Could not extract constructor schema: ${e.message}`);
  }

  await this.generatedContractService.save(
    userId,
    sources,
    contractName,
    constructorArgsSchema,
  );

  // Add pending deploy if constructor has parameters
  if (Object.keys(constructorArgsSchema).length > 0) {
    pendingDeploys.push({
      contractName,
      constructorArgs: constructorArgsSchema,
    });
  }

  return { sources, contractName, constructorArgs: constructorArgsSchema };
}
```

**Step 3: Run build**

Run: `npm run build`
Expected: Compiles successfully

**Step 4: Run existing tests**

Run: `npx jest --testPathPattern=blockchain`
Expected: All tests pass (SolcService is mocked in these tests)

**Step 5: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: extract constructor args schema from ABI after generateContract"
```

---

### Task 3: Backend — Add constructor args validation in blockchain.service.ts

**Files:**
- Modify: `src/blockchain/blockchain.service.ts:85-92` (constructor args mapping)

**Step 1: Add validation before deploy**

Find the constructor args extraction block (around line 85). Replace the `?? ''` fallback with validation:

```typescript
const constructorAbi = abi.find((item: any) => item.type === 'constructor');
const args = constructorAbi
  ? constructorAbi.inputs.map((input: any) => {
      const value = constructorArgs[input.name];
      if (value === undefined || value === null || value === '') {
        throw new Error(
          `Missing constructor argument: "${input.name}" (${input.type})`,
        );
      }
      return value;
    })
  : [];
```

**Step 2: Run build**

Run: `npm run build`
Expected: Compiles successfully

**Step 3: Run existing tests**

Run: `npx jest --testPathPattern=blockchain`
Expected: All tests pass (the mock returns empty constructor)

**Step 4: Commit**

```bash
git add src/blockchain/blockchain.service.ts
git commit -m "fix: validate constructor args before deploy instead of defaulting to empty strings"
```

---

### Task 4: Frontend — Add PendingDeploy type

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add PendingDeploy interface and update LocalMessage**

After the `Deployment` interface (around line 82), add:

```typescript
export interface PendingDeploy {
  contractName: string;
  constructorArgs: Record<string, { type: string }>;
}
```

In the `ChatResponse` interface, add:

```typescript
pendingDeploys: PendingDeploy[];
```

In the `LocalMessage` interface (around line 133), add:

```typescript
pendingDeploys?: PendingDeploy[];
```

**Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds (components not yet consuming the type)

**Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add PendingDeploy type to frontend types"
```

---

### Task 5: Frontend — Update ChatStore to handle pendingDeploys

**Files:**
- Modify: `frontend/src/stores/chat-store.ts`

**Step 1: Parse pendingDeploys from API response**

In the `sendMessage` method (around line 110), update the assistant message creation:

```typescript
const assistantMessage: LocalMessage = {
  id: crypto.randomUUID(),
  role: 'assistant',
  content: res.data.message,
  deployments:
    res.data.deployments.length > 0
      ? res.data.deployments
      : undefined,
  pendingDeploys:
    res.data.pendingDeploys?.length > 0
      ? res.data.pendingDeploys
      : undefined,
  timestamp: new Date().toISOString(),
};
```

**Step 2: Add deployFromCard action**

Add a new method to the store that sends a deploy message through the chat:

```typescript
deployFromCard: async (contractName: string, constructorArgs: Record<string, string>) => {
  const argsDescription = Object.entries(constructorArgs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const message = `Deploy ${contractName} with constructor args: ${argsDescription}`;
  get().sendMessage(message);
},
```

**Step 3: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/stores/chat-store.ts
git commit -m "feat: handle pendingDeploys in chat store and add deployFromCard action"
```

---

### Task 6: Frontend — Create PendingDeployCard component

**Files:**
- Create: `frontend/src/components/chat/pending-deploy-card.tsx`
- Reference: `frontend/src/components/marketplace/deploy-form.tsx` (pattern to follow)

**Step 1: Create the PendingDeployCard component**

Model it after the marketplace `deploy-form.tsx`. The component receives a constructor args schema, renders form fields, and calls `deployFromCard` on submit.

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Loader2 } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import type { PendingDeploy } from '@/lib/types';

interface PendingDeployCardProps {
  pendingDeploy: PendingDeploy;
  deployed?: boolean;
}

export function PendingDeployCard({
  pendingDeploy,
  deployed = false,
}: PendingDeployCardProps) {
  const { contractName, constructorArgs } = pendingDeploy;
  const deployFromCard = useChatStore((s) => s.deployFromCard);
  const isLoading = useChatStore((s) => s.isLoading);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of Object.keys(constructorArgs)) {
      initial[key] = '';
    }
    return initial;
  });

  const allFilled = Object.values(values).every((v) => v.trim() !== '');

  const handleDeploy = () => {
    if (!allFilled) return;
    deployFromCard(contractName, values);
  };

  return (
    <Card className="mt-3 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Rocket className="h-4 w-4" />
          Deploy {contractName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(constructorArgs).map(([name, { type }]) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={`arg-${name}`} className="text-xs">
              {name}{' '}
              <span className="text-muted-foreground font-mono">({type})</span>
            </Label>
            <Input
              id={`arg-${name}`}
              placeholder={type}
              value={values[name]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [name]: e.target.value }))
              }
              disabled={deployed || isLoading}
              className="h-8 text-sm font-mono"
            />
          </div>
        ))}
        <Button
          onClick={handleDeploy}
          disabled={!allFilled || deployed || isLoading}
          size="sm"
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Deploying...
            </>
          ) : deployed ? (
            'Deployed'
          ) : (
            <>
              <Rocket className="mr-2 h-3 w-3" />
              Deploy Contract
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/chat/pending-deploy-card.tsx
git commit -m "feat: add PendingDeployCard component for constructor args collection"
```

---

### Task 7: Frontend — Wire PendingDeployCard into MessageBubble

**Files:**
- Modify: `frontend/src/components/chat/message-bubble.tsx`

**Step 1: Import PendingDeployCard**

Add import at top of file:

```typescript
import { PendingDeployCard } from './pending-deploy-card';
```

**Step 2: Render PendingDeployCard after deployments**

Find the deployments mapping block (around line 72-74). After it, add:

```tsx
{message.pendingDeploys?.map((pd, i) => (
  <PendingDeployCard
    key={i}
    pendingDeploy={pd}
    deployed={!!message.deployments?.length}
  />
))}
```

**Step 3: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Start frontend and visually verify**

Run: `cd frontend && npm run dev`
Expected: App starts, chat page loads without errors

**Step 5: Commit**

```bash
git add frontend/src/components/chat/message-bubble.tsx
git commit -m "feat: render PendingDeployCard in chat message bubbles"
```

---

### Task 8: Integration test — End-to-end flow verification

**Step 1: Verify backend starts cleanly**

Run: `npm run build && npm start`
Expected: No errors, all routes mapped

**Step 2: Verify frontend starts cleanly**

Run: `cd frontend && npm run build`
Expected: No build errors

**Step 3: Manual smoke test checklist**

1. Open chat at `http://localhost:3000`
2. Log in (or register)
3. Send: "Write a simple voting contract with proposals"
4. Verify: AI generates contract code, and a `PendingDeployCard` appears with form fields for constructor params (e.g., chairperson, startTs, endTs)
5. Fill in the form fields with valid values
6. Click "Deploy Contract"
7. Verify: A deployment message is sent, and a `DeploymentCard` appears with the contract address

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: constructor args collection card — integration complete"
```
