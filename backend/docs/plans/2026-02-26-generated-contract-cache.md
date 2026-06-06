# Generated Contract Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache generated contracts in MongoDB with TTL so `deployCustomContract` can fall back to cached sources when AI fails to pass them in the two-phase flow.

**Architecture:** New `GeneratedContract` Mongoose schema with TTL index in `OpenAiModule`. `generateContract` saves to cache, `deployCustomContract` falls back to cache when sources are invalid. One cached contract per user, auto-expires after 1 hour.

**Tech Stack:** NestJS, Mongoose, MongoDB TTL index, Jest

---

### Task 1: Create GeneratedContract schema

**Files:**
- Create: `src/openai/schemas/generated-contract.schema.ts`

**Step 1: Create the schema file**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema()
export class GeneratedContract extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
    index: true,
  })
  userId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  sources: Record<string, { content: string }>;

  @Prop({ required: true })
  contractName: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  constructorArgs: Record<string, string>;

  @Prop({ default: Date.now, expires: 3600 })
  createdAt: Date;
}

export const GeneratedContractSchema =
  SchemaFactory.createForClass(GeneratedContract);
```

The `expires: 3600` on `createdAt` creates a TTL index — MongoDB auto-deletes documents 3600 seconds (1 hour) after creation.

**Step 2: Verify schema compiles**

Run: `npx tsc --noEmit src/openai/schemas/generated-contract.schema.ts`

This will fail because `tsc` needs full project context. Instead verify with:

Run: `npx nest build`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/openai/schemas/generated-contract.schema.ts
git commit -m "feat: add GeneratedContract schema with TTL index"
```

---

### Task 2: Create GeneratedContractService

**Files:**
- Create: `src/openai/generated-contract.service.ts`
- Create: `src/openai/generated-contract.service.spec.ts`

**Step 1: Write the tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GeneratedContractService } from './generated-contract.service';
import { GeneratedContract } from './schemas/generated-contract.schema';

const mockModel = {
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  deleteMany: jest.fn(),
};

describe('GeneratedContractService', () => {
  let service: GeneratedContractService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratedContractService,
        {
          provide: getModelToken(GeneratedContract.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<GeneratedContractService>(GeneratedContractService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('save', () => {
    it('should upsert generated contract for user', async () => {
      const sources = { 'Voting.sol': { content: 'pragma solidity...' } };
      mockModel.findOneAndUpdate.mockResolvedValue({
        userId: 'user-1',
        sources,
        contractName: 'Voting',
      });

      await service.save('user-1', sources, 'Voting', {});
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-1' },
        {
          userId: 'user-1',
          sources,
          contractName: 'Voting',
          constructorArgs: {},
          createdAt: expect.any(Date),
        },
        { upsert: true, new: true },
      );
    });
  });

  describe('findByUser', () => {
    it('should return cached contract for user', async () => {
      const cached = {
        userId: 'user-1',
        sources: { 'Voting.sol': { content: 'code' } },
        contractName: 'Voting',
        constructorArgs: {},
      };
      mockModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(cached),
        }),
      });

      const result = await service.findByUser('user-1');
      expect(result).toEqual(cached);
      expect(mockModel.findOne).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('should return null when no cached contract exists', async () => {
      mockModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.findByUser('user-2');
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Write the service**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeneratedContract } from './schemas/generated-contract.schema';

@Injectable()
export class GeneratedContractService {
  constructor(
    @InjectModel(GeneratedContract.name)
    private readonly model: Model<GeneratedContract>,
  ) {}

  async save(
    userId: string,
    sources: Record<string, { content: string }>,
    contractName: string,
    constructorArgs: Record<string, string>,
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { userId },
      {
        userId,
        sources,
        contractName,
        constructorArgs,
        createdAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async findByUser(
    userId: string,
  ): Promise<GeneratedContract | null> {
    return this.model.findOne({ userId }).lean().exec();
  }
}
```

**Step 3: Run tests**

Run: `npx jest --testPathPattern=generated-contract.service.spec.ts --verbose`
Expected: 4 tests PASS.

**Step 4: Commit**

```bash
git add src/openai/generated-contract.service.ts src/openai/generated-contract.service.spec.ts
git commit -m "feat: add GeneratedContractService with save and findByUser"
```

---

### Task 3: Wire GeneratedContract into OpenAiModule

**Files:**
- Modify: `src/openai/openai.module.ts`

**Step 1: Register schema and service in module**

Update `src/openai/openai.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OpenAiService } from './openai.service';
import { ToolDispatchService } from './tool-dispatch.service';
import { GeneratedContractService } from './generated-contract.service';
import { AssistantController } from './assistant.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import {
  GeneratedContract,
  GeneratedContractSchema,
} from './schemas/generated-contract.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GeneratedContract.name, schema: GeneratedContractSchema },
    ]),
    BlockchainModule,
    AuthModule,
    TokensModule,
    forwardRef(() => MarketplaceModule),
  ],
  controllers: [AssistantController],
  providers: [OpenAiService, ToolDispatchService, GeneratedContractService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
```

**Step 2: Verify build**

Run: `npx nest build`
Expected: No errors.

**Step 3: Verify all tests still pass**

Run: `npm test`
Expected: All suites pass (the new service spec included).

**Step 4: Commit**

```bash
git add src/openai/openai.module.ts
git commit -m "feat: register GeneratedContract schema and service in OpenAiModule"
```

---

### Task 4: Update generateContract to save to cache

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:254-265` (generateContract case)
- Modify: `src/openai/tool-dispatch.service.ts:28-39` (constructor — add GeneratedContractService)
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Update the test**

In `src/openai/tool-dispatch.service.spec.ts`, add mock for GeneratedContractService at the top with the other mocks:

```typescript
const mockGeneratedContractService = {
  save: jest.fn().mockResolvedValue(undefined),
  findByUser: jest.fn().mockResolvedValue(null),
};
```

Add it to the providers array in the test module:

```typescript
import { GeneratedContractService } from './generated-contract.service';

// In providers array:
{ provide: GeneratedContractService, useValue: mockGeneratedContractService },
```

Update the existing `'should dispatch generateContract and return structured sources'` test to also verify `save` was called:

After the existing assertions, add:

```typescript
expect(mockGeneratedContractService.save).toHaveBeenCalledWith(
  'user-id',
  expect.objectContaining({ 'Voting.sol': { content: expect.any(String) } }),
  'Voting',
  {},
);
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts --verbose`
Expected: FAIL — `save` was never called because the implementation doesn't exist yet.

**Step 3: Update ToolDispatchService**

In `src/openai/tool-dispatch.service.ts`, add to constructor:

```typescript
import { GeneratedContractService } from './generated-contract.service';

// In constructor:
private readonly generatedContractService: GeneratedContractService,
```

Update the `generateContract` case (around line 254):

```typescript
case 'generateContract': {
  const code = await this.openAiService.generateContract(
    args.contractDescription,
  );
  const contractName = this.extractContractName(code);
  const fileName = `${contractName}.sol`;
  const sources = { [fileName]: { content: code } };

  await this.generatedContractService.save(
    userId,
    sources,
    contractName,
    {},
  );

  return { sources, contractName, constructorArgs: {} };
}
```

**Step 4: Run tests**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts --verbose`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: save generated contract to cache on generateContract"
```

---

### Task 5: Update deployCustomContract to fall back to cache

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:208-214` (deployCustomContract validation)
- Test: `src/openai/tool-dispatch.service.spec.ts`

**Step 1: Write the failing test**

Add to the `handleChat` describe block in `src/openai/tool-dispatch.service.spec.ts`:

```typescript
it('should fall back to cached sources when deployCustomContract sources are empty', async () => {
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
        arguments:
          '{"sources":{},"contractName":"A","constructorArgs":{}}',
      },
    ],
  });
  mockGeneratedContractService.findByUser.mockResolvedValue({
    sources: { 'Voting.sol': { content: 'pragma solidity ^0.8.0; contract Voting {}' } },
    contractName: 'Voting',
    constructorArgs: {},
  });
  mockBlockchainService.deployCustomContract.mockResolvedValue({
    contractAddress: '0xcache',
  });
  mockTokensService.create.mockResolvedValue({ _id: 'token-cache' });
  mockOpenAiService.submitToolOutput.mockResolvedValue({
    responseId: 'resp_2',
    outputText: 'Deployed from cache!',
    toolCalls: [],
  });

  const result = await service.handleChat('Deploy it', 'user-id');
  expect(mockGeneratedContractService.findByUser).toHaveBeenCalledWith('user-id');
  expect(mockBlockchainService.deployCustomContract).toHaveBeenCalledWith(
    { 'Voting.sol': { content: 'pragma solidity ^0.8.0; contract Voting {}' } },
    'Voting',
    {},
    'test mnemonic',
  );
  expect(result.deployments).toHaveLength(1);
  expect(result.deployments[0].contractAddress).toBe('0xcache');
});

it('should return error when sources invalid and no cache exists', async () => {
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
        arguments:
          '{"sources":{},"contractName":"A","constructorArgs":{}}',
      },
    ],
  });
  mockGeneratedContractService.findByUser.mockResolvedValue(null);
  mockOpenAiService.submitToolOutput.mockResolvedValue({
    responseId: 'resp_2',
    outputText: 'No cached contract',
    toolCalls: [],
  });

  await service.handleChat('Deploy it', 'user-id');
  expect(mockBlockchainService.deployCustomContract).not.toHaveBeenCalled();
  expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
    'resp_1',
    'call_1',
    expect.stringContaining('No previously generated contract found'),
    expect.anything(),
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts --verbose`
Expected: 2 new tests FAIL — current code returns error immediately when sources are invalid, doesn't check cache.

**Step 3: Update the deployCustomContract case**

Replace the validation block (lines 208-214) in `src/openai/tool-dispatch.service.ts`:

```typescript
case 'deployCustomContract': {
  let sources = args.sources;
  let contractName = args.contractName;
  let constructorArgs = args.constructorArgs;

  if (!this.validateSources(sources)) {
    // Fall back to cached generated contract
    const cached = await this.generatedContractService.findByUser(userId);
    if (!cached) {
      return {
        error:
          'No previously generated contract found. Use generateContract first or provide sources directly.',
      };
    }
    sources = cached.sources;
    contractName = cached.contractName;
    // Prefer user-provided constructorArgs over cached ones
    constructorArgs =
      constructorArgs && Object.keys(constructorArgs).length > 0
        ? constructorArgs
        : cached.constructorArgs;
  }

  const result = await this.blockchainService.deployCustomContract(
    sources,
    contractName,
    constructorArgs,
    mnemonic,
  );
  const token = await this.persistDeploy(
    TokenType.CUSTOM_CONTRACT,
    {
      ...result,
      contractName,
      constructorArgs,
      sources,
    },
    userId,
    projectId,
  );
  deployments.push({
    contractAddress: result.contractAddress,
    tokenId: String(token._id),
    type: 'custom-contract',
  });

  this.marketplaceService
    .createTemplate({
      type: TokenType.CUSTOM_CONTRACT,
      sources,
      contractName,
      contractAddress: result.contractAddress,
      creatorId: userId,
      projectId,
    })
    .catch((err) =>
      this.logger.error('Failed to create marketplace entry', err.stack),
    );

  return result;
}
```

**Step 4: Update existing "sources is empty" test**

The existing test `'should return error when deployCustomContract sources is empty'` now needs to account for the cache fallback. Since the mock `findByUser` defaults to `null`, the error message will change. Update its assertion:

```typescript
expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
  'resp_1',
  'call_1',
  expect.stringContaining('No previously generated contract found'),
  expect.anything(),
);
```

**Step 5: Run tests**

Run: `npx jest --testPathPattern=tool-dispatch.service.spec.ts --verbose`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git commit -m "feat: fall back to cached contract when sources are invalid"
```

---

### Task 6: Update system prompt

**Files:**
- Modify: `src/openai/tool-dispatch.service.ts:10-16` (CHAT_SYSTEM_PROMPT)

**Step 1: Update the prompt**

Replace the `CHAT_SYSTEM_PROMPT` constant:

```typescript
const CHAT_SYSTEM_PROMPT = `You are a blockchain assistant that helps users create and deploy smart contracts.

Tool usage rules:
- When the user asks to "create", "generate", or "write" a contract: call generateContract first to show the code. Wait for the user to confirm before deploying.
- When the user asks to "deploy" a contract: call deployCustomContract or deployERC20 directly.
- When deploying after generateContract, you can call deployCustomContract with empty sources — the backend will use the previously generated contract. Just pass the constructorArgs if the user provided any.
- When calling deployCustomContract with new code (not from generateContract), the "sources" parameter MUST be a map of filenames to objects with a "content" field containing complete Solidity source code.
- For ERC20 tokens, prefer deployERC20 over deployCustomContract.`.trim();
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All suites pass (system prompt test uses `stringContaining('blockchain assistant')` which still matches).

**Step 3: Commit**

```bash
git add src/openai/tool-dispatch.service.ts
git commit -m "feat: update system prompt to tell AI about cache fallback"
```

---

### Task 7: Full test suite, build, and smoke test

**Step 1: Run all tests**

```bash
npm test
```

Expected: All suites pass, including new `generated-contract.service.spec.ts`.

**Step 2: Build**

```bash
npx nest build
```

Expected: No errors.

**Step 3: Smoke test**

```bash
npm run start:dev &
# Wait for startup

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seed@chaincraft.dev","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Step A: Generate a contract
RESP=$(curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Create a simple counter contract"}')
echo "$RESP" | python3 -m json.tool
RESPONSE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['responseId'])")

# Step B: Deploy it (should use cache)
curl -s -X POST http://localhost:3001/assistants/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"message\":\"Deploy it\",\"previousResponseId\":\"$RESPONSE_ID\"}" | python3 -m json.tool

# Expected: contractAddress in deployments array
```
