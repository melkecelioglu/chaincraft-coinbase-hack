# Contract Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public contract marketplace with AI-enriched templates, 1-click redeploy, and MongoDB vector search for semantic discovery.

**Architecture:** New `MarketplaceModule` with `ContractTemplate` collection. Every deploy auto-creates a marketplace entry enriched with AI-generated description/tags and a vector embedding. MongoDB upgraded to 8.2 with mongot sidecar for native `$vectorSearch`. Existing `Token` collection stays as deploy log.

**Tech Stack:** NestJS, Mongoose, MongoDB 8.2 + mongot, OpenAI Responses API (gpt-5.2), OpenAI Embeddings API (text-embedding-3-small), class-validator, class-transformer

**Design doc:** `docs/plans/2026-02-25-contract-marketplace-design.md`

---

### Task 1: Upgrade Docker Compose to MongoDB 8.2 + mongot

Replace `mongo:7` with MongoDB 8.2 Community Server + mongot sidecar for vector search support.

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Stop existing containers**

Run: `docker compose down`

**Step 2: Update docker-compose.yml**

Replace the entire file:

```yaml
services:
  mongod:
    image: mongodb/mongodb-community-server:8.2.0-ubi9
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db

  mongot:
    image: mongodb/mongodb-community-search:0.53.1
    ports:
      - '27028:27028'
    volumes:
      - mongot-data:/data/mongot
    depends_on:
      - mongod

volumes:
  mongo-data:
  mongot-data:
```

**Step 3: Start new containers**

Run: `docker compose up -d`

**Step 4: Initialize replica set**

Run: `docker exec -it $(docker compose ps -q mongod) mongosh --eval "rs.initiate()"`
Expected: `{ ok: 1 }`

**Step 5: Verify connection**

Run: `docker exec -it $(docker compose ps -q mongod) mongosh --eval "rs.status().ok"`
Expected: `1`

**Step 6: Verify NestJS can connect**

Run: `npm run start:dev` (start briefly, check no connection errors, then stop)
Expected: `MongooseCoreModule dependencies initialized` in logs

**Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: upgrade to MongoDB 8.2 + mongot for vector search"
```

---

### Task 2: Add embedding methods to OpenAiService

Add `generateEmbedding()` and `enrichContract()` methods. These will be used by the marketplace service.

**Files:**
- Modify: `src/openai/openai.service.ts`
- Modify: `src/openai/openai.service.spec.ts`

**Step 1: Write failing tests**

Add these test blocks to the end of the `describe('OpenAiService')` in `src/openai/openai.service.spec.ts`, before the closing `});`:

```typescript
  describe('generateEmbedding', () => {
    it('should return embedding array from OpenAI', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      (service as any).openai.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: mockEmbedding, index: 0 }],
        }),
      };

      const result = await service.generateEmbedding('test text');
      expect(result).toEqual(mockEmbedding);
      expect((service as any).openai.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test text',
        dimensions: 1536,
      });
    });
  });

  describe('enrichContract', () => {
    it('should return description, tags, and constructorArgs from AI', async () => {
      const enrichResult = {
        description: 'A burnable ERC20 token',
        tags: ['erc20', 'burnable'],
        constructorArgs: {
          name: { type: 'string', description: 'Token name' },
          symbol: { type: 'string', description: 'Token symbol' },
        },
      };
      mockCreate(service).mockResolvedValue({
        output_text: JSON.stringify(enrichResult),
      });

      const result = await service.enrichContract(
        { 'Token.sol': { content: 'pragma solidity...' } },
        'BurnToken',
      );
      expect(result.description).toBe('A burnable ERC20 token');
      expect(result.tags).toContain('erc20');
      expect(result.constructorArgs).toHaveProperty('name');
    });

    it('should throw HttpException on malformed response', async () => {
      mockCreate(service).mockResolvedValue({ output_text: 'not json' });

      await expect(
        service.enrichContract({}, 'Bad'),
      ).rejects.toThrow(HttpException);
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/openai/openai.service.spec.ts --no-cache`
Expected: FAIL — `service.generateEmbedding is not a function`, `service.enrichContract is not a function`

**Step 3: Add the exported interface and methods**

Add this interface after `AnalyzeContractResult` (after line 41) in `src/openai/openai.service.ts`:

```typescript
export interface EnrichContractResult {
  description: string;
  tags: string[];
  constructorArgs: Record<string, { type: string; description: string }>;
}
```

Add this prompt constant after `CONTRACT_GENERATOR_PROMPT` (after line 29):

```typescript
const CONTRACT_ENRICHMENT_PROMPT = `You are a smart contract analyst. Given Solidity source files and a contract name, generate metadata for a contract marketplace listing.

Return a JSON object with:
1. "description": A clear 1-2 sentence summary of what the contract does and its key features
2. "tags": An array of 3-8 lowercase tags (e.g. "erc20", "staking", "governance", "defi", "nft", "access-control", "burnable", "pausable", "upgradeable")
3. "constructorArgs": An object where each key is a constructor parameter name, and each value is { "type": "solidity type", "description": "what this parameter does" }. If no constructor or no args, use empty object {}.

Return ONLY the JSON object, no markdown.`.trim();
```

Add these two methods to the `OpenAiService` class, before the `private async callApi` method:

```typescript
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Embedding generation failed: ${error.message}`, error.stack);
      throw new HttpException('Embedding generation failed', HttpStatus.BAD_GATEWAY);
    }
  }

  async enrichContract(
    sources: Record<string, { content: string }>,
    contractName: string,
  ): Promise<EnrichContractResult> {
    const sourceText = Object.entries(sources)
      .map(([file, { content }]) => `// ${file}\n${content}`)
      .join('\n\n');

    const response = await this.callApi({
      model: MODEL,
      instructions: CONTRACT_ENRICHMENT_PROMPT,
      input: `Contract name: ${contractName}\n\nSource code:\n${sourceText}`,
      text: { format: { type: 'json_object' as const } },
    });

    try {
      return JSON.parse(response.output_text) as EnrichContractResult;
    } catch {
      this.logger.error('Failed to parse contract enrichment response', response.output_text);
      throw new HttpException(
        'Failed to parse contract enrichment from OpenAI',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
```

**Step 4: Update the mock setup**

In `src/openai/openai.service.spec.ts`, update the `jest.mock('openai')` block to also include the embeddings client:

```typescript
jest.mock('openai', () => {
  const mockConstructor = jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn(),
    },
    embeddings: {
      create: jest.fn(),
    },
  }));
  return { __esModule: true, default: mockConstructor };
});
```

**Step 5: Run tests**

Run: `npx jest src/openai/openai.service.spec.ts --no-cache`
Expected: All PASS (13 tests — 11 existing + 2 new)

**Step 6: Commit**

```bash
git add src/openai/openai.service.ts src/openai/openai.service.spec.ts
git commit -m "feat: add generateEmbedding and enrichContract to OpenAiService"
```

---

### Task 3: Create ContractTemplate schema

New Mongoose schema for the marketplace collection.

**Files:**
- Create: `src/marketplace/schemas/contract-template.schema.ts`

**Step 1: Create the schema file**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SmartUser } from '../../auth/schemas/user.schema';
import { TokenType } from '../../tokens/schemas/token.schema';

@Schema({ timestamps: true })
export class ContractTemplate extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], required: true })
  tags: string[];

  @Prop({ required: true, enum: TokenType })
  type: TokenType;

  @Prop()
  template: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  sources: Record<string, { content: string }>;

  @Prop({ required: true })
  contractName: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  constructorArgs: Record<string, { type: string; description: string }>;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  originalDeployment: {
    contractAddress: string;
    chain: string;
    deployedAt: string;
  };

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
  })
  creator: SmartUser;

  @Prop({ default: 1 })
  deployCount: number;
}

export const ContractTemplateSchema = SchemaFactory.createForClass(ContractTemplate);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/marketplace/schemas/contract-template.schema.ts
git commit -m "feat: add ContractTemplate schema for marketplace"
```

---

### Task 4: Create MarketplaceService

Core service for template CRUD, AI enrichment, embedding generation, and vector search.

**Files:**
- Create: `src/marketplace/marketplace.service.ts`
- Create: `src/marketplace/marketplace.service.spec.ts`

**Step 1: Write failing tests**

Create `src/marketplace/marketplace.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MarketplaceService } from './marketplace.service';
import { ContractTemplate } from './schemas/contract-template.schema';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../tokens/tokens.service';

const mockContractTemplateModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
};

const mockOpenAiService = {
  enrichContract: jest.fn(),
  generateEmbedding: jest.fn(),
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

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: getModelToken(ContractTemplate.name), useValue: mockContractTemplateModel },
        { provide: OpenAiService, useValue: mockOpenAiService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TokensService, useValue: mockTokensService },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTemplate', () => {
    it('should enrich contract, generate embedding, and create template', async () => {
      const sources = { 'Token.sol': { content: 'pragma solidity...' } };
      mockOpenAiService.enrichContract.mockResolvedValue({
        description: 'An ERC20 token',
        tags: ['erc20'],
        constructorArgs: {},
      });
      mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockContractTemplateModel.create.mockResolvedValue({
        _id: 'tmpl-1',
        name: 'TestToken',
      });

      const result = await service.createTemplate({
        type: 'erc20',
        template: 'erc20',
        sources,
        contractName: 'TestToken',
        contractAddress: '0xabc',
        creatorId: 'user-1',
      });

      expect(mockOpenAiService.enrichContract).toHaveBeenCalledWith(sources, 'TestToken');
      expect(mockOpenAiService.generateEmbedding).toHaveBeenCalled();
      expect(mockContractTemplateModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestToken',
          description: 'An ERC20 token',
          tags: ['erc20'],
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ name: 'Token1' }]),
      };
      mockContractTemplateModel.find.mockReturnValue(mockQuery);
      mockContractTemplateModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a template by ID', async () => {
      mockContractTemplateModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'tmpl-1', name: 'Token' }),
      });

      const result = await service.findOne('tmpl-1');
      expect(result.name).toBe('Token');
    });

    it('should throw NotFoundException for missing template', async () => {
      mockContractTemplateModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('bad-id')).rejects.toThrow();
    });
  });

  describe('redeploy', () => {
    it('should deploy from template and create Token record', async () => {
      const template = {
        _id: 'tmpl-1',
        type: 'custom-contract',
        sources: { 'A.sol': { content: 'code' } },
        contractName: 'A',
      };
      mockContractTemplateModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(template),
      });
      mockAuthService.getUserById.mockResolvedValue({ walletMnemonic: 'mnemonic' });
      mockBlockchainService.deployCustomContract.mockResolvedValue({ contractAddress: '0xdef' });
      mockTokensService.create.mockResolvedValue({ _id: 'token-1' });
      mockContractTemplateModel.findByIdAndUpdate.mockResolvedValue({});

      const result = await service.redeploy('tmpl-1', { arg1: 'val1' }, 'user-1');
      expect(result.contractAddress).toBe('0xdef');
      expect(mockContractTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'tmpl-1',
        { $inc: { deployCount: 1 } },
      );
    });
  });

  describe('semanticSearch', () => {
    it('should generate embedding and call aggregate', async () => {
      mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockContractTemplateModel.aggregate.mockResolvedValue([
        { name: 'StakingPool', score: 0.95 },
      ]);

      const result = await service.semanticSearch('staking contract', 5);
      expect(mockOpenAiService.generateEmbedding).toHaveBeenCalledWith('staking contract');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('StakingPool');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/marketplace/marketplace.service.spec.ts --no-cache`
Expected: FAIL — `Cannot find module './marketplace.service'`

**Step 3: Implement MarketplaceService**

Create `src/marketplace/marketplace.service.ts`:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContractTemplate } from './schemas/contract-template.schema';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../tokens/schemas/token.schema';

export interface CreateTemplateInput {
  type: string;
  template?: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  contractAddress: string;
  creatorId: string;
  projectId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface RedeployResult {
  contractAddress: string;
  tokenId: string;
  templateId: string;
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectModel(ContractTemplate.name)
    private readonly templateModel: Model<ContractTemplate>,
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  async createTemplate(input: CreateTemplateInput): Promise<ContractTemplate> {
    const enrichment = await this.openAiService.enrichContract(
      input.sources,
      input.contractName,
    );

    const embeddingText = `${input.contractName} ${enrichment.description} ${enrichment.tags.join(' ')}`;
    const embedding = await this.openAiService.generateEmbedding(embeddingText);

    return this.templateModel.create({
      name: input.contractName,
      description: enrichment.description,
      tags: enrichment.tags,
      type: input.type as TokenType,
      template: input.template,
      sources: input.sources,
      contractName: input.contractName,
      constructorArgs: enrichment.constructorArgs,
      originalDeployment: {
        contractAddress: input.contractAddress,
        chain: 'base-sepolia',
        deployedAt: new Date().toISOString(),
      },
      embedding,
      creator: input.creatorId,
      deployCount: 1,
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    tags?: string[];
  }): Promise<PaginatedResult<ContractTemplate>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.tags?.length) {
      filter.tags = { $in: query.tags };
    }

    const [items, total] = await Promise.all([
      this.templateModel
        .find(filter)
        .sort({ deployCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-embedding')
        .exec(),
      this.templateModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<ContractTemplate> {
    const template = await this.templateModel
      .findById(id)
      .populate('creator', 'username walletAddress')
      .exec();

    if (!template) {
      throw new NotFoundException(`Contract template ${id} not found`);
    }

    return template;
  }

  async redeploy(
    templateId: string,
    constructorArgs: Record<string, string>,
    userId: string,
    projectId?: string,
  ): Promise<RedeployResult> {
    const template = await this.findOne(templateId);
    const user = await this.authService.getUserById(userId);

    let contractAddress: string;

    if (template.type === TokenType.ERC20 && template.template === 'erc20') {
      const result = await this.blockchainService.deployToken(
        constructorArgs.name || 'Token',
        constructorArgs.symbol || 'TKN',
        Number(constructorArgs.totalSupply) || 1000000,
        user.walletMnemonic,
      );
      contractAddress = result.contractAddress;
    } else {
      const result = await this.blockchainService.deployCustomContract(
        template.sources,
        template.contractName,
        constructorArgs,
        user.walletMnemonic,
      );
      contractAddress = result.contractAddress;
    }

    const token = await this.tokensService.create({
      type: template.type,
      data: JSON.stringify({
        contractAddress,
        contractName: template.contractName,
        constructorArgs,
        sources: template.sources,
        redeployedFromTemplate: templateId,
        deployedAt: new Date().toISOString(),
      }),
      user: userId,
      project: projectId,
    });

    await this.templateModel.findByIdAndUpdate(templateId, {
      $inc: { deployCount: 1 },
    });

    return {
      contractAddress,
      tokenId: String(token._id),
      templateId,
    };
  }

  async semanticSearch(
    query: string,
    limit = 10,
  ): Promise<Array<ContractTemplate & { score: number }>> {
    const queryEmbedding = await this.openAiService.generateEmbedding(query);

    return this.templateModel.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 20,
          limit,
        },
      },
      {
        $project: {
          embedding: 0,
        },
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);
  }
}
```

**Step 4: Run tests**

Run: `npx jest src/marketplace/marketplace.service.spec.ts --no-cache`
Expected: All PASS (6 tests)

**Step 5: Commit**

```bash
git add src/marketplace/marketplace.service.ts src/marketplace/marketplace.service.spec.ts
git commit -m "feat: add MarketplaceService with CRUD, redeploy, and vector search"
```

---

### Task 5: Create MarketplaceController + DTOs

REST controller with endpoints for listing, searching, detail view, and redeploy.

**Files:**
- Create: `src/marketplace/dto/redeploy.dto.ts`
- Create: `src/marketplace/marketplace.controller.ts`
- Create: `src/marketplace/marketplace.controller.spec.ts`

**Step 1: Create RedployDto**

Create `src/marketplace/dto/redeploy.dto.ts`:

```typescript
import { IsObject, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RedeployDto {
  @ApiProperty({ description: 'Constructor arguments for the contract' })
  @IsObject()
  constructorArgs: Record<string, string>;

  @ApiPropertyOptional({ description: 'Project ID to associate deploy with' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
```

**Step 2: Write failing controller test**

Create `src/marketplace/marketplace.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

const mockMarketplaceService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  redeploy: jest.fn(),
  semanticSearch: jest.fn(),
};

describe('MarketplaceController', () => {
  let controller: MarketplaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [
        { provide: MarketplaceService, useValue: mockMarketplaceService },
      ],
    }).compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      mockMarketplaceService.findAll.mockResolvedValue({
        items: [{ name: 'Token' }],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.findAll(1, 20, undefined);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      mockMarketplaceService.semanticSearch.mockResolvedValue([
        { name: 'Staking', score: 0.9 },
      ]);

      const result = await controller.search('staking', 5);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return template details', async () => {
      mockMarketplaceService.findOne.mockResolvedValue({ _id: 'tmpl-1', name: 'Token' });

      const result = await controller.findOne('tmpl-1');
      expect(result.name).toBe('Token');
    });
  });

  describe('redeploy', () => {
    it('should deploy from template', async () => {
      mockMarketplaceService.redeploy.mockResolvedValue({
        contractAddress: '0xabc',
        tokenId: 'tok-1',
        templateId: 'tmpl-1',
      });

      const result = await controller.redeploy(
        'tmpl-1',
        { constructorArgs: { name: 'New' }, projectId: undefined },
        'user-1',
      );
      expect(result.contractAddress).toBe('0xabc');
    });
  });
});
```

**Step 3: Implement MarketplaceController**

Create `src/marketplace/marketplace.controller.ts`:

```typescript
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { MarketplaceService } from './marketplace.service';
import { RedeployDto } from './dto/redeploy.dto';

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all contract templates' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tags', required: false, type: String, description: 'Comma-separated tags' })
  @ApiResponse({ status: 200, description: 'Paginated list of templates' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tags') tags?: string,
  ) {
    return this.marketplaceService.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
    });
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search templates by natural language description' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Matching templates with similarity scores' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.marketplaceService.semanticSearch(
      query,
      limit ? Number(limit) : undefined,
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get contract template details' })
  @ApiResponse({ status: 200, description: 'Template details with sources and args schema' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id') id: string) {
    return this.marketplaceService.findOne(id);
  }

  @Post(':id/deploy')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Redeploy a contract from template with new parameters' })
  @ApiResponse({ status: 201, description: 'Contract deployed from template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async redeploy(
    @Param('id') id: string,
    @Body() dto: RedeployDto,
    @GetUser('id') userId: string,
  ) {
    return this.marketplaceService.redeploy(
      id,
      dto.constructorArgs,
      userId,
      dto.projectId,
    );
  }
}
```

**Step 4: Run tests**

Run: `npx jest src/marketplace/marketplace.controller.spec.ts --no-cache`
Expected: All PASS (5 tests)

**Step 5: Commit**

```bash
git add src/marketplace/dto/redeploy.dto.ts src/marketplace/marketplace.controller.ts src/marketplace/marketplace.controller.spec.ts
git commit -m "feat: add MarketplaceController with list, search, detail, redeploy endpoints"
```

---

### Task 6: Create MarketplaceModule + wire into AppModule

Wire everything together and register the new module.

**Files:**
- Create: `src/marketplace/marketplace.module.ts`
- Modify: `src/app.module.ts`

**Step 1: Create MarketplaceModule**

Create `src/marketplace/marketplace.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContractTemplate,
  ContractTemplateSchema,
} from './schemas/contract-template.schema';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { OpenAiModule } from '../openai/openai.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContractTemplate.name, schema: ContractTemplateSchema },
    ]),
    OpenAiModule,
    BlockchainModule,
    AuthModule,
    TokensModule,
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
```

**Step 2: Register in AppModule**

In `src/app.module.ts`, add the import at the top:

```typescript
import { MarketplaceModule } from './marketplace/marketplace.module';
```

And add `MarketplaceModule` to the `imports` array (after `ContractsModule`).

**Step 3: Build**

Run: `npm run build`
Expected: PASS (0 errors)

**Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/marketplace/marketplace.module.ts src/app.module.ts
git commit -m "feat: add MarketplaceModule and wire into AppModule"
```

---

### Task 7: Hook deploy flows to create marketplace entries

After every deploy (via `/contracts/deploy` and via AI chat), automatically create a ContractTemplate marketplace entry.

**Files:**
- Modify: `src/contracts/contracts.controller.ts`
- Modify: `src/contracts/contracts.module.ts`
- Modify: `src/openai/tool-dispatch.service.ts`
- Modify: `src/openai/openai.module.ts`

**Step 1: Update ContractsModule to import MarketplaceModule**

In `src/contracts/contracts.module.ts`, add:

```typescript
import { MarketplaceModule } from '../marketplace/marketplace.module';
```

And add `MarketplaceModule` to the `imports` array.

**Step 2: Update ContractsController to inject MarketplaceService**

In `src/contracts/contracts.controller.ts`:

Add import:
```typescript
import { MarketplaceService } from '../marketplace/marketplace.service';
```

Add to constructor:
```typescript
private readonly marketplaceService: MarketplaceService,
```

After the ERC20 deploy return statement (after the `return { ...result, tokenId... }` line in the erc20 block), add marketplace creation. Replace the existing ERC20 block's return with:

```typescript
      const tokenResult = { ...result, tokenId: String(token._id), type: 'erc20' as const };
      this.createMarketplaceEntry({
        type: 'erc20',
        template: 'erc20',
        sources: { [`${dto.params.name}.sol`]: { content: `// ERC20 Template: ${dto.params.name} (${dto.params.symbol})` } },
        contractName: dto.params.name,
        contractAddress: result.contractAddress,
        creatorId: userId,
        projectId: dto.projectId,
      });
      return tokenResult;
```

Replace the existing custom deploy block's return with:

```typescript
    const customResult = { ...result, tokenId: String(token._id), type: 'custom-contract' as const };
    this.createMarketplaceEntry({
      type: 'custom-contract',
      sources: dto.sources,
      contractName: dto.contractName,
      contractAddress: result.contractAddress,
      creatorId: userId,
      projectId: dto.projectId,
    });
    return customResult;
```

Add a private method to the controller:

```typescript
  private createMarketplaceEntry(input: {
    type: string;
    template?: string;
    sources: Record<string, { content: string }>;
    contractName: string;
    contractAddress: string;
    creatorId: string;
    projectId?: string;
  }) {
    this.marketplaceService.createTemplate(input).catch((error) => {
      this.logger.error('Failed to create marketplace entry', error.message);
    });
  }
```

Also add `Logger` import and field:
```typescript
private readonly logger = new Logger(ContractsController.name);
```

**Step 3: Update OpenAiModule to import MarketplaceModule**

In `src/openai/openai.module.ts`, add:

```typescript
import { MarketplaceModule } from '../marketplace/marketplace.module';
```

Add `MarketplaceModule` to the `imports` array.

**Step 4: Update ToolDispatchService to create marketplace entries**

In `src/openai/tool-dispatch.service.ts`:

Add import:
```typescript
import { MarketplaceService } from '../marketplace/marketplace.service';
```

Add to constructor:
```typescript
private readonly marketplaceService: MarketplaceService,
```

In the `deployERC20` case, after `deployments.push(...)`, add:

```typescript
        this.createMarketplaceEntry({
          type: 'erc20',
          template: 'erc20',
          sources: { [`${args.name}.sol`]: { content: `// ERC20 Template: ${args.name} (${args.symbol})` } },
          contractName: args.name,
          contractAddress: result.contractAddress,
          creatorId: userId,
        });
```

In the `deployCustomContract` case, after `deployments.push(...)`, add:

```typescript
        this.createMarketplaceEntry({
          type: 'custom-contract',
          sources: args.sources,
          contractName: args.contractName,
          contractAddress: result.contractAddress,
          creatorId: userId,
        });
```

Add private method:

```typescript
  private createMarketplaceEntry(input: {
    type: string;
    template?: string;
    sources: Record<string, { content: string }>;
    contractName: string;
    contractAddress: string;
    creatorId: string;
  }) {
    this.marketplaceService.createTemplate(input).catch((error) => {
      this.logger.error('Failed to create marketplace entry', error.message);
    });
  }
```

**Step 5: Handle circular dependency**

Both `OpenAiModule` and `MarketplaceModule` would import each other. To avoid this, use `forwardRef`:

In `src/openai/openai.module.ts`:
```typescript
import { forwardRef } from '@nestjs/common';
// ...
imports: [BlockchainModule, AuthModule, TokensModule, forwardRef(() => MarketplaceModule)],
```

In `src/marketplace/marketplace.module.ts`:
```typescript
import { forwardRef } from '@nestjs/common';
// ...
imports: [
  MongooseModule.forFeature([...]),
  forwardRef(() => OpenAiModule),
  BlockchainModule,
  AuthModule,
  TokensModule,
],
```

In `src/openai/tool-dispatch.service.ts`, use `@Inject(forwardRef(...))`:
```typescript
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { MarketplaceService } from '../marketplace/marketplace.service';

// In constructor:
@Inject(forwardRef(() => MarketplaceService))
private readonly marketplaceService: MarketplaceService,
```

**Step 6: Build**

Run: `npm run build`
Expected: PASS

**Step 7: Run all tests**

Run: `npm test`
Expected: All PASS (update mocks in tool-dispatch.service.spec.ts if needed — add `MarketplaceService` mock)

**Step 8: Commit**

```bash
git add src/contracts/contracts.controller.ts src/contracts/contracts.module.ts src/openai/tool-dispatch.service.ts src/openai/openai.module.ts src/marketplace/marketplace.module.ts
git commit -m "feat: hook deploy flows to auto-create marketplace entries"
```

---

### Task 8: Create vector search index

Create the MongoDB vector search index on the `ContractTemplate` collection for semantic search.

**Files:**
- Create: `scripts/create-vector-index.js`

**Step 1: Create index script**

Create `scripts/create-vector-index.js`:

```javascript
// Run: node scripts/create-vector-index.js
// Requires: MongoDB 8.2 + mongot running

const { MongoClient } = require('mongodb');

const DB_URI = process.env.DB_CONNECTION_STRING || 'mongodb://localhost:27017/openai-func?replicaSet=rs0';

async function main() {
  const client = new MongoClient(DB_URI);
  await client.connect();

  const db = client.db();

  try {
    await db.command({
      createSearchIndexes: 'contracttemplates',
      indexes: [
        {
          name: 'vector_index',
          type: 'vectorSearch',
          definition: {
            fields: [
              {
                type: 'vector',
                path: 'embedding',
                numDimensions: 1536,
                similarity: 'cosine',
              },
              {
                type: 'filter',
                path: 'tags',
              },
              {
                type: 'filter',
                path: 'type',
              },
            ],
          },
        },
      ],
    });

    console.log('Vector search index created successfully');
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('Vector search index already exists');
    } else {
      console.error('Failed to create index:', error.message);
      process.exit(1);
    }
  }

  await client.close();
}

main();
```

**Step 2: Run the script**

Run: `node scripts/create-vector-index.js`
Expected: `Vector search index created successfully`

**Step 3: Commit**

```bash
git add scripts/create-vector-index.js
git commit -m "feat: add vector search index creation script"
```

---

### Task 9: Update CLAUDE.md + full verification

Update documentation and run complete verification.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add `MarketplaceModule` to the architecture tree:

```
├── MarketplaceModule  — /marketplace/* — Contract marketplace with vector search
│   ├── MarketplaceService     — Template CRUD, AI enrichment, vector search, redeploy
│   └── MarketplaceController  — list, search, detail, redeploy endpoints
```

Add to API routes table:

```
| `/marketplace` | MarketplaceModule | MarketplaceController | GET /, GET /search, GET /:id, POST /:id/deploy |
```

Add to cross-module dependencies:

```
- **MarketplaceModule** imports OpenAiModule + BlockchainModule + AuthModule + TokensModule
```

Update Token schema description:
```
- **ContractTemplate** — name, description, tags, type, sources, contractName, constructorArgs, originalDeployment, embedding (1536-dim vector), creator (ObjectId ref), deployCount
```

**Step 2: Build**

Run: `npm run build`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 4: Start server and smoke test**

Run: `npm run start:dev` (background)

Verify new routes registered:
- `GET /marketplace` — should return `{ items: [], total: 0, page: 1, limit: 20 }` (public, no auth needed)
- `GET /marketplace/search?q=staking` — may fail if no data yet, but should not 404
- `POST /marketplace/:id/deploy` — should return 401 (auth required)
- Old endpoints still work: `POST /auth/register`, `POST /contracts/deploy`, `POST /assistants/chat`

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for contract marketplace"
```
