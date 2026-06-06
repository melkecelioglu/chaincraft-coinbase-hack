# Contract Flow Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from deprecated Assistants API to Responses API (gpt-5.2), add general-purpose deploy with DB persistence.

**Architecture:** Replace all OpenAI Assistants/Chat Completions code with Responses API. Unify deploy into single endpoint supporting template (ERC20) and custom Solidity contracts. Persist every deploy to MongoDB Token collection.

**Tech Stack:** NestJS, OpenAI SDK v6+ (Responses API), Coinbase SDK, Mongoose, class-validator

**Design doc:** `docs/plans/2026-02-24-contract-flow-redesign.md`

---

### Task 1: Upgrade OpenAI SDK to v6+

Current `openai@4.85.4` does not support Responses API. Must upgrade to v6+.

**Files:**
- Modify: `package.json`

**Step 1: Upgrade package**

Run: `npm install openai@latest`

**Step 2: Verify install**

Run: `npm ls openai`
Expected: `openai@6.x.x` (6.22.0 or later)

**Step 3: Build to check for breaking import changes**

Run: `npm run build`
Expected: May show errors — that is OK, we will fix them in subsequent tasks.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade openai SDK to v6 for Responses API support"
```

---

### Task 2: Rewrite OpenAiService with Responses API

Replace all Assistants API and Chat Completions code with Responses API.

**Files:**
- Rewrite: `src/openai/openai.service.ts`
- Test: `src/openai/openai.service.spec.ts`

**Step 1: Write failing tests**

Create `src/openai/openai.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService } from './openai.service';
import { ConfigService } from '@nestjs/config';

// Mock the openai module
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn(),
    },
  }));
});

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'OPENAI_API_KEY') return 'test-key';
    return key;
  }),
};

describe('OpenAiService', () => {
  let service: OpenAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OpenAiService>(OpenAiService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chat', () => {
    it('should call responses.create with correct params', async () => {
      const mockResponse = {
        id: 'resp_123',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'Hello!' }] },
        ],
        output_text: 'Hello!',
      };
      (service as any).openai.responses.create.mockResolvedValue(mockResponse);

      const result = await service.chat('Hello', []);
      expect(result).toBeDefined();
      expect(result.outputText).toBe('Hello!');
    });
  });

  describe('analyzeContract', () => {
    it('should return parsed JSON from structured output', async () => {
      const mockResponse = {
        output_text: '{"sources":{"Hello.sol":{"content":"pragma solidity ^0.8.0;"}},"name":"Hello","constructorArgs":{}}',
      };
      (service as any).openai.responses.create.mockResolvedValue(mockResponse);

      const result = await service.analyzeContract('pragma solidity ^0.8.0;');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('constructorArgs');
    });
  });

  describe('generateContract', () => {
    it('should return Solidity code string', async () => {
      const mockResponse = {
        output_text: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Hello {}',
      };
      (service as any).openai.responses.create.mockResolvedValue(mockResponse);

      const result = await service.generateContract('a simple hello contract');
      expect(result).toContain('pragma solidity');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/openai/openai.service.spec.ts --no-cache`
Expected: FAIL (methods don't exist yet)

**Step 3: Rewrite OpenAiService**

Rewrite `src/openai/openai.service.ts` completely:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Tool } from 'openai/resources/responses/responses';

const SOLIDITY_ANALYZER_PROMPT = `
You are a Solidity code analyzer. When given a smart contract, you must:
1. Analyze the code and identify ALL imports
2. Extract the main contract name and constructor arguments:
   - Look for the constructor function in the main contract
   - Use EXACT parameter names from the constructor (including underscores)
   - If no constructor or no args, use empty object {}
3. For each imported contract:
   - If it's from OpenZeppelin, use the latest stable version
   - Include the full implementation
4. Return ONLY a JSON object with: sources, name, constructorArgs
5. Keep all original formatting, comments, and whitespace in the content
6. Make sure file paths exactly match the import statements
7. The main contract file name must match the actual contract name in the code
`.trim();

const CONTRACT_GENERATOR_PROMPT = `You are a Solidity smart contract expert. Create secure, well-documented smart contracts following these rules:
1. Always include SPDX license and pragma
2. Add detailed comments explaining functionality
3. Follow security best practices
4. Include necessary OpenZeppelin imports
5. Return ONLY the Solidity code, no explanations
6. Format code properly with correct indentation`.trim();

export interface ChatResponse {
  responseId: string;
  outputText: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

export interface AnalyzeContractResult {
  sources: Record<string, { content: string }>;
  name: string;
  constructorArgs: Record<string, string>;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
    });
  }

  async chat(
    message: string,
    tools: Tool[],
    previousResponseId?: string,
  ): Promise<ChatResponse> {
    const response = await this.openai.responses.create({
      model: 'gpt-5.2',
      input: message,
      tools,
      ...(previousResponseId && { previous_response_id: previousResponseId }),
    });

    const toolCalls = response.output
      .filter((item: any) => item.type === 'function_call')
      .map((item: any) => ({
        id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      }));

    return {
      responseId: response.id,
      outputText: response.output_text || '',
      toolCalls,
    };
  }

  async submitToolOutput(
    previousResponseId: string,
    toolCallId: string,
    output: string,
    tools: Tool[],
  ): Promise<ChatResponse> {
    const response = await this.openai.responses.create({
      model: 'gpt-5.2',
      previous_response_id: previousResponseId,
      input: [
        {
          type: 'function_call_output',
          call_id: toolCallId,
          output,
        },
      ],
      tools,
    });

    const toolCalls = response.output
      .filter((item: any) => item.type === 'function_call')
      .map((item: any) => ({
        id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      }));

    return {
      responseId: response.id,
      outputText: response.output_text || '',
      toolCalls,
    };
  }

  async analyzeContract(contractCode: string): Promise<AnalyzeContractResult> {
    const response = await this.openai.responses.create({
      model: 'gpt-5.2',
      instructions: SOLIDITY_ANALYZER_PROMPT,
      input: contractCode,
      text: { format: { type: 'json_object' } },
    });

    return JSON.parse(response.output_text);
  }

  async generateContract(contractDescription: string): Promise<string> {
    const response = await this.openai.responses.create({
      model: 'gpt-5.2',
      instructions: CONTRACT_GENERATOR_PROMPT,
      input: `Create a Solidity smart contract for: ${contractDescription}`,
    });

    const text = response.output_text;
    const codeMatch = text.match(/```solidity\s*([\s\S]*?)\s*```/) ||
      text.match(/```\s*([\s\S]*?)\s*```/) || [null, text];

    return codeMatch[1].trim();
  }
}
```

**Step 4: Run tests**

Run: `npx jest src/openai/openai.service.spec.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/openai/openai.service.ts src/openai/openai.service.spec.ts
git commit -m "feat: rewrite OpenAiService with Responses API and gpt-5.2"
```

---

### Task 3: Create ToolDispatchService

Replaces AssistantRunService. Routes tool calls from Responses API to BlockchainService.

**Files:**
- Create: `src/openai/tool-dispatch.service.ts`
- Test: `src/openai/tool-dispatch.service.spec.ts`
- Delete: `src/openai/assistant-run.service.ts`

**Step 1: Write failing tests**

Create `src/openai/tool-dispatch.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ToolDispatchService } from './tool-dispatch.service';
import { OpenAiService } from './openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../tokens/tokens.service';

const mockOpenAiService = {
  chat: jest.fn(),
  submitToolOutput: jest.fn(),
  generateContract: jest.fn(),
  analyzeContract: jest.fn(),
};
const mockBlockchainService = {
  deployToken: jest.fn(),
  deployCustomContract: jest.fn(),
};
const mockAuthService = {
  getUserById: jest.fn(),
};
const mockTokensService = {
  create: jest.fn(),
};

describe('ToolDispatchService', () => {
  let service: ToolDispatchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolDispatchService,
        { provide: OpenAiService, useValue: mockOpenAiService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TokensService, useValue: mockTokensService },
      ],
    }).compile();

    service = module.get<ToolDispatchService>(ToolDispatchService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleChat', () => {
    it('should return text response when no tool calls', async () => {
      mockAuthService.getUserById.mockResolvedValue({
        walletMnemonic: 'test mnemonic',
      });
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: 'Hello!',
        toolCalls: [],
      });

      const result = await service.handleChat('Hello', 'user-id');
      expect(result.message).toBe('Hello!');
    });

    it('should dispatch deployERC20 tool call and persist to DB', async () => {
      mockAuthService.getUserById.mockResolvedValue({
        walletMnemonic: 'test mnemonic',
      });
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployERC20',
            arguments: '{"name":"TestCoin","symbol":"TC","totalSupply":1000000}',
          },
        ],
      });
      mockBlockchainService.deployToken.mockResolvedValue({
        contractAddress: '0xabc',
      });
      mockTokensService.create.mockResolvedValue({ _id: 'token-id' });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Deployed!',
        toolCalls: [],
      });

      const result = await service.handleChat('Deploy a token', 'user-id');
      expect(mockBlockchainService.deployToken).toHaveBeenCalled();
      expect(mockTokensService.create).toHaveBeenCalled();
    });

    it('should dispatch generateContract tool call', async () => {
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
            arguments: '{"contractDescription":"a staking contract"}',
          },
        ],
      });
      mockOpenAiService.generateContract.mockResolvedValue(
        'pragma solidity ^0.8.0; contract Staking {}',
      );
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Here is your contract',
        toolCalls: [],
      });

      const result = await service.handleChat('Create staking contract', 'user-id');
      expect(mockOpenAiService.generateContract).toHaveBeenCalledWith(
        'a staking contract',
      );
    });
  });

  describe('getTools', () => {
    it('should return 3 function tools', () => {
      const tools = service.getTools();
      expect(tools).toHaveLength(3);
      expect(tools.map((t: any) => t.name)).toEqual(
        expect.arrayContaining([
          'deployERC20',
          'deployCustomContract',
          'generateContract',
        ]),
      );
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/openai/tool-dispatch.service.spec.ts --no-cache`
Expected: FAIL

**Step 3: Implement ToolDispatchService**

Create `src/openai/tool-dispatch.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService, ChatResponse } from './openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../tokens/schemas/token.schema';
import { Tool } from 'openai/resources/responses/responses';

export interface ChatResult {
  message: string;
  responseId: string;
  deployments: Array<{
    contractAddress: string;
    tokenId: string;
    type: string;
  }>;
}

@Injectable()
export class ToolDispatchService {
  private readonly logger = new Logger(ToolDispatchService.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  getTools(): Tool[] {
    return [
      {
        type: 'function',
        name: 'deployERC20',
        description: 'Deploy an ERC20 token to the blockchain',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Token name' },
            symbol: { type: 'string', description: 'Token symbol' },
            totalSupply: { type: 'number', description: 'Total supply' },
          },
          required: ['name', 'symbol', 'totalSupply'],
        },
        strict: true,
      },
      {
        type: 'function',
        name: 'deployCustomContract',
        description: 'Deploy a custom Solidity contract to the blockchain',
        parameters: {
          type: 'object',
          properties: {
            sources: {
              type: 'object',
              description: 'Solidity source files map',
              additionalProperties: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
              },
            },
            contractName: { type: 'string', description: 'Main contract name' },
            constructorArgs: {
              type: 'object',
              description: 'Constructor arguments',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['sources', 'contractName', 'constructorArgs'],
        },
        strict: true,
      },
      {
        type: 'function',
        name: 'generateContract',
        description: 'Generate a Solidity smart contract from a description',
        parameters: {
          type: 'object',
          properties: {
            contractDescription: {
              type: 'string',
              description: 'Description of the contract to generate',
            },
          },
          required: ['contractDescription'],
        },
        strict: true,
      },
    ];
  }

  async handleChat(
    message: string,
    userId: string,
    projectId?: string,
    previousResponseId?: string,
  ): Promise<ChatResult> {
    const user = await this.authService.getUserById(userId);
    const tools = this.getTools();
    const deployments: ChatResult['deployments'] = [];

    let response = await this.openAiService.chat(
      message,
      tools,
      previousResponseId,
    );

    // Agentic loop: process tool calls until none remain
    while (response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const args = JSON.parse(toolCall.arguments);
        const output = await this.dispatchToolCall(
          toolCall.name,
          args,
          user.walletMnemonic,
          userId,
          projectId,
          deployments,
        );

        response = await this.openAiService.submitToolOutput(
          response.responseId,
          toolCall.id,
          JSON.stringify(output),
          tools,
        );
      }
    }

    return {
      message: response.outputText,
      responseId: response.responseId,
      deployments,
    };
  }

  private async dispatchToolCall(
    name: string,
    args: Record<string, any>,
    mnemonic: string,
    userId: string,
    projectId: string | undefined,
    deployments: ChatResult['deployments'],
  ): Promise<unknown> {
    switch (name) {
      case 'deployERC20': {
        const result = await this.blockchainService.deployToken(
          args.name,
          args.symbol,
          args.totalSupply,
          mnemonic,
        );
        const token = await this.persistDeploy(
          TokenType.ERC20,
          { ...result, name: args.name, symbol: args.symbol, totalSupply: args.totalSupply },
          userId,
          projectId,
        );
        deployments.push({
          contractAddress: result.contractAddress,
          tokenId: String(token._id),
          type: 'erc20',
        });
        return result;
      }

      case 'deployCustomContract': {
        const result = await this.blockchainService.deployCustomContract(
          args.sources,
          args.contractName,
          args.constructorArgs,
          mnemonic,
        );
        const token = await this.persistDeploy(
          TokenType.CUSTOM_CONTRACT,
          { ...result, contractName: args.contractName, constructorArgs: args.constructorArgs, sources: args.sources },
          userId,
          projectId,
        );
        deployments.push({
          contractAddress: result.contractAddress,
          tokenId: String(token._id),
          type: 'custom-contract',
        });
        return result;
      }

      case 'generateContract':
        return this.openAiService.generateContract(args.contractDescription);

      default:
        this.logger.warn(`Unknown tool call: ${name}`);
        return { error: `Unknown function: ${name}` };
    }
  }

  private async persistDeploy(
    type: TokenType,
    data: Record<string, any>,
    userId: string,
    projectId?: string,
  ) {
    return this.tokensService.create({
      type,
      data: JSON.stringify({ ...data, deployedAt: new Date().toISOString() }),
      user: userId,
      project: projectId,
    });
  }
}
```

**Step 4: Run tests**

Run: `npx jest src/openai/tool-dispatch.service.spec.ts --no-cache`
Expected: PASS

**Step 5: Delete old AssistantRunService**

Delete file: `src/openai/assistant-run.service.ts`

**Step 6: Commit**

```bash
git add src/openai/tool-dispatch.service.ts src/openai/tool-dispatch.service.spec.ts
git rm src/openai/assistant-run.service.ts
git commit -m "feat: add ToolDispatchService, remove AssistantRunService"
```

---

### Task 4: Rewrite AssistantController

Replace 3 old endpoints with single `POST /assistants/chat`.

**Files:**
- Rewrite: `src/openai/assistant.controller.ts`
- Create: `src/openai/dto/chat.dto.ts`
- Test: `src/openai/assistant.controller.spec.ts`

**Step 1: Create ChatDto**

Create `src/openai/dto/chat.dto.ts`:

```typescript
import { IsNotEmpty, IsString, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({ description: 'Message to send to the AI assistant' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Project ID for context' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Previous response ID for conversation chaining' })
  @IsOptional()
  @IsString()
  previousResponseId?: string;
}
```

**Step 2: Write failing test**

Create `src/openai/assistant.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AssistantController } from './assistant.controller';
import { ToolDispatchService } from './tool-dispatch.service';

const mockToolDispatchService = {
  handleChat: jest.fn(),
};

describe('AssistantController', () => {
  let controller: AssistantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        { provide: ToolDispatchService, useValue: mockToolDispatchService },
      ],
    }).compile();

    controller = module.get<AssistantController>(AssistantController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should call toolDispatchService.handleChat', async () => {
      mockToolDispatchService.handleChat.mockResolvedValue({
        message: 'Done!',
        responseId: 'resp_1',
        deployments: [],
      });

      const result = await controller.chat(
        { message: 'Hello', projectId: undefined, previousResponseId: undefined },
        'user-id',
      );

      expect(mockToolDispatchService.handleChat).toHaveBeenCalledWith(
        'Hello',
        'user-id',
        undefined,
        undefined,
      );
      expect(result.message).toBe('Done!');
    });
  });
});
```

**Step 3: Rewrite AssistantController**

Rewrite `src/openai/assistant.controller.ts`:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ToolDispatchService } from './tool-dispatch.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Assistants')
@ApiBearerAuth()
@Controller('assistants')
export class AssistantController {
  constructor(private readonly toolDispatchService: ToolDispatchService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Chat with AI assistant — can deploy contracts and generate code',
  })
  @ApiResponse({ status: 200, description: 'Assistant response with optional deployments' })
  async chat(@Body() dto: ChatDto, @GetUser('id') userId: string) {
    return this.toolDispatchService.handleChat(
      dto.message,
      userId,
      dto.projectId,
      dto.previousResponseId,
    );
  }
}
```

**Step 4: Run tests**

Run: `npx jest src/openai/assistant.controller.spec.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/openai/assistant.controller.ts src/openai/assistant.controller.spec.ts src/openai/dto/chat.dto.ts
git commit -m "feat: rewrite AssistantController with single POST /chat endpoint"
```

---

### Task 5: Update OpenAiModule wiring

Wire new services, add TokensModule import.

**Files:**
- Modify: `src/openai/openai.module.ts`

**Step 1: Update module**

Rewrite `src/openai/openai.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { ToolDispatchService } from './tool-dispatch.service';
import { AssistantController } from './assistant.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [BlockchainModule, AuthModule, TokensModule],
  controllers: [AssistantController],
  providers: [OpenAiService, ToolDispatchService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
```

**Step 2: Build**

Run: `npm run build`
Expected: PASS (0 errors)

**Step 3: Commit**

```bash
git add src/openai/openai.module.ts
git commit -m "feat: update OpenAiModule wiring with ToolDispatchService + TokensModule"
```

---

### Task 6: Update DeployContractDto and ContractsController

Add template/custom union DTO. Add DB persistence to deploy endpoint. Add `GET /contracts/:id`.

**Files:**
- Rewrite: `src/contracts/dto/deploy-contract.dto.ts`
- Modify: `src/contracts/contracts.controller.ts`
- Modify: `src/contracts/contracts.module.ts`

**Step 1: Rewrite DeployContractDto**

Rewrite `src/contracts/dto/deploy-contract.dto.ts`:

```typescript
import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsMongoId,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ERC20Params {
  @ApiProperty({ description: 'Token name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token symbol' })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Total supply' })
  @IsNotEmpty()
  @IsNumber()
  totalSupply: number;
}

export class DeployContractDto {
  // --- Template deploy ---
  @ApiPropertyOptional({ description: 'Template name (e.g. "erc20")', enum: ['erc20'] })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ description: 'Template parameters' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ERC20Params)
  @ValidateIf((o) => o.template !== undefined)
  params?: ERC20Params;

  // --- Custom deploy ---
  @ApiPropertyOptional({ description: 'Solidity source files' })
  @IsOptional()
  @IsObject()
  sources?: Record<string, { content: string }>;

  @ApiPropertyOptional({ description: 'Contract name' })
  @IsOptional()
  @IsString()
  contractName?: string;

  @ApiPropertyOptional({ description: 'Constructor arguments' })
  @IsOptional()
  @IsObject()
  constructorArgs?: Record<string, string>;

  // --- Common ---
  @ApiPropertyOptional({ description: 'Project ID to associate with' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
```

**Step 2: Update ContractsController**

Rewrite `src/contracts/contracts.controller.ts`:

```typescript
import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ContractAnalysisService } from './contract-analysis.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../tokens/schemas/token.schema';
import { AnalyzeContractDto } from './dto/analyze-contract.dto';
import { DeployContractDto } from './dto/deploy-contract.dto';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly contractAnalysisService: ContractAnalysisService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze Solidity contract and generate sources object' })
  @ApiResponse({ status: 200, description: 'Contract analyzed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid contract code' })
  async analyze(@Body() dto: AnalyzeContractDto) {
    this.contractAnalysisService.validateSyntax(dto.contractCode);
    return this.openAiService.analyzeContract(dto.contractCode);
  }

  @Post('deploy')
  @ApiOperation({ summary: 'Deploy a contract (template or custom Solidity)' })
  @ApiResponse({ status: 201, description: 'Contract deployed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid deploy request' })
  async deploy(@Body() dto: DeployContractDto, @GetUser('id') userId: string) {
    if (!dto.template && !dto.sources) {
      throw new BadRequestException('Either "template" or "sources" must be provided');
    }
    if (dto.template && dto.sources) {
      throw new BadRequestException('Provide either "template" or "sources", not both');
    }

    const user = await this.authService.getUserById(userId);

    if (dto.template === 'erc20') {
      if (!dto.params) {
        throw new BadRequestException('params required for erc20 template');
      }
      const result = await this.blockchainService.deployToken(
        dto.params.name,
        dto.params.symbol,
        dto.params.totalSupply,
        user.walletMnemonic,
      );
      const token = await this.tokensService.create({
        type: TokenType.ERC20,
        data: JSON.stringify({
          ...result,
          template: 'erc20',
          params: dto.params,
          deployedAt: new Date().toISOString(),
        }),
        user: userId,
        project: dto.projectId,
      });
      return { ...result, tokenId: String(token._id), type: 'erc20' };
    }

    // Custom deploy
    if (!dto.contractName) {
      throw new BadRequestException('contractName required for custom deploy');
    }
    const result = await this.blockchainService.deployCustomContract(
      dto.sources,
      dto.contractName,
      dto.constructorArgs || {},
      user.walletMnemonic,
    );
    const token = await this.tokensService.create({
      type: TokenType.CUSTOM_CONTRACT,
      data: JSON.stringify({
        ...result,
        contractName: dto.contractName,
        constructorArgs: dto.constructorArgs,
        sources: dto.sources,
        deployedAt: new Date().toISOString(),
      }),
      user: userId,
      project: dto.projectId,
    });
    return { ...result, tokenId: String(token._id), type: 'custom-contract' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deployed contract details' })
  @ApiResponse({ status: 200, description: 'Contract details' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async findOne(@Param('id') id: string) {
    const token = await this.tokensService.findOne(id);
    return {
      id: String(token._id),
      type: token.type,
      data: JSON.parse(token.data),
      user: String(token.user),
      project: token.project ? String(token.project) : null,
    };
  }
}
```

**Step 3: Update ContractsModule — add TokensModule import**

Modify `src/contracts/contracts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ContractAnalysisService } from './contract-analysis.service';
import { ContractsController } from './contracts.controller';
import { OpenAiModule } from '../openai/openai.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [OpenAiModule, BlockchainModule, AuthModule, TokensModule],
  controllers: [ContractsController],
  providers: [ContractAnalysisService],
  exports: [ContractAnalysisService],
})
export class ContractsModule {}
```

**Step 4: Build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/contracts/dto/deploy-contract.dto.ts src/contracts/contracts.controller.ts src/contracts/contracts.module.ts
git commit -m "feat: unified deploy endpoint (template + custom) with DB persistence"
```

---

### Task 7: Make Token.project optional

Currently `project` field is `required: true` in Token schema. Deploy via chat may not have a project context.

**Files:**
- Modify: `src/tokens/schemas/token.schema.ts`
- Modify: `src/tokens/dto/create-token.dto.ts`
- Modify: `src/tokens/dto/internal-token.dto.ts`

**Step 1: Update Token schema**

In `src/tokens/schemas/token.schema.ts`, change `project` prop from `required: true` to `required: false`:

```typescript
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Project',
    required: false,
  })
  project: Project;
```

**Step 2: Update CreateTokenDto**

In `src/tokens/dto/create-token.dto.ts`, make `project` optional:

Replace `@IsNotEmpty()` + `@IsMongoId()` on project with:

```typescript
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Project ID (optional)',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  project?: string;
```

Add `IsOptional` to imports.

**Step 3: Update InternalTokenDto**

In `src/tokens/dto/internal-token.dto.ts`, make project optional:

```typescript
import { CreateTokenDto } from './create-token.dto';

export interface InternalTokenDto extends CreateTokenDto {
  user: string;
  project?: string;
}
```

**Step 4: Run all tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tokens/schemas/token.schema.ts src/tokens/dto/create-token.dto.ts src/tokens/dto/internal-token.dto.ts
git commit -m "feat: make Token.project optional for chat-based deploys"
```

---

### Task 8: Update CLAUDE.md and run full verification

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Update the architecture section to reflect new endpoints and module structure:
- AssistantController now only has `POST /chat`
- ContractsController has `POST /analyze`, `POST /deploy`, `GET /:id`
- OpenAiModule now includes ToolDispatchService, imports TokensModule
- ContractsModule now imports TokensModule
- Remove references to Assistants API, polling, assistant creation

**Step 2: Build**

Run: `npm run build`
Expected: PASS (0 errors)

**Step 3: Run all unit tests**

Run: `npm test`
Expected: All PASS

**Step 4: Start server and smoke test**

Run: `npm run start:dev` (background)

Test endpoints:
- `POST /auth/register` — get token
- `POST /assistants/chat` — send message
- `POST /contracts/analyze` — analyze Solidity code
- `POST /contracts/deploy` — deploy with template
- `GET /contracts/:id` — retrieve deployed contract
- Verify old endpoints return 404: `POST /assistants/general`, `GET /assistants/run`

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Responses API migration"
```
