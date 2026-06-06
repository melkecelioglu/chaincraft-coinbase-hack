import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MarketplaceService } from './marketplace.service';
import { ContractTemplate } from './schemas/contract-template.schema';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { SolcService } from '../blockchain/solc.service';
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
  getErc20Sources: jest.fn().mockReturnValue({
    'ERC20Token.sol': { content: 'pragma solidity...' },
  }),
};
const mockSolcService = {
  compile: jest.fn().mockReturnValue({
    abi: [{ type: 'constructor', inputs: [] }],
    bytecode: '0x1234',
    compilerVersion: 'v0.8.20',
  }),
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
        {
          provide: getModelToken(ContractTemplate.name),
          useValue: mockContractTemplateModel,
        },
        { provide: OpenAiService, useValue: mockOpenAiService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: SolcService, useValue: mockSolcService },
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
    it('should include source code summary in embedding text', async () => {
      const sources = {
        'Token.sol': { content: 'pragma solidity ^0.8.20;\n\ncontract Token {\n    function transfer() {}\n}' },
      };
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

      await service.createTemplate({
        type: 'erc20',
        template: 'erc20',
        sources,
        contractName: 'TestToken',
        contractAddress: '0xabc',
        creatorId: 'user-1',
      });

      const embeddingCall = mockOpenAiService.generateEmbedding.mock.calls[0][0];
      expect(embeddingCall).toContain('TestToken');
      expect(embeddingCall).toContain('An ERC20 token');
      expect(embeddingCall).toContain('erc20');
      // Source code summary should be included
      expect(embeddingCall).toContain('pragma solidity');
    });
  });

  describe('findAll', () => {
    it('should return paginated templates (list mode)', async () => {
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
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter by tags in list mode', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockContractTemplateModel.find.mockReturnValue(mockQuery);
      mockContractTemplateModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.findAll({ tags: ['erc20', 'defi'] });
      expect(mockContractTemplateModel.find).toHaveBeenCalledWith({
        tags: { $in: ['erc20', 'defi'] },
      });
    });

    it('should use semantic search when q is provided', async () => {
      mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockContractTemplateModel.aggregate.mockResolvedValue([
        { items: [{ name: 'StakingPool', score: 0.95 }], totalCount: [{ count: 1 }] },
      ]);

      const result = await service.findAll({ q: 'staking contract', page: 1, limit: 10 });

      expect(mockOpenAiService.generateEmbedding).toHaveBeenCalledWith('staking contract');
      expect(mockContractTemplateModel.aggregate).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should combine semantic search with tag filter', async () => {
      mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockContractTemplateModel.aggregate.mockResolvedValue([
        { items: [{ name: 'StakingPool', score: 0.9 }], totalCount: [{ count: 1 }] },
      ]);

      await service.findAll({ q: 'staking', tags: ['defi'], page: 1, limit: 10 });

      const pipeline = mockContractTemplateModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$vectorSearch).toBeDefined();
      expect(pipeline.some((stage: any) => stage.$match?.tags)).toBe(true);
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
    it('should compile from template and return compile result', async () => {
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
      mockSolcService.compile.mockReturnValue({
        abi: [{ type: 'constructor', inputs: [] }],
        bytecode: '0xabcd',
        compilerVersion: 'v0.8.20',
      });
      mockContractTemplateModel.findByIdAndUpdate.mockResolvedValue({});

      const result = await service.redeploy(
        'tmpl-1',
        { arg1: 'val1' },
        'user-1',
      );
      expect(result.abi).toBeDefined();
      expect(result.bytecode).toBe('0xabcd');
      expect(result.contractName).toBe('A');
      expect(result.templateId).toBe('tmpl-1');
      expect(mockContractTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'tmpl-1',
        { $inc: { deployCount: 1 } },
      );
    });
  });

  describe('semanticSearch', () => {
    it('should delegate to findAll and return items', async () => {
      mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockContractTemplateModel.aggregate.mockResolvedValue([
        { items: [{ name: 'StakingPool', score: 0.95 }], totalCount: [{ count: 1 }] },
      ]);

      const result = await service.semanticSearch('staking contract', 5);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('StakingPool');
    });
  });

  describe('getDistinctTags', () => {
    it('should return unique tags with counts sorted by count desc', async () => {
      mockContractTemplateModel.aggregate.mockResolvedValue([
        { tag: 'erc20', count: 15 },
        { tag: 'defi', count: 8 },
        { tag: 'staking', count: 3 },
      ]);

      const result = await service.getDistinctTags();

      expect(mockContractTemplateModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
      ]);
      expect(result).toEqual([
        { tag: 'erc20', count: 15 },
        { tag: 'defi', count: 8 },
        { tag: 'staking', count: 3 },
      ]);
    });
  });
});
