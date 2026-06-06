import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

const mockMarketplaceService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  redeploy: jest.fn(),
  semanticSearch: jest.fn(),
  getDistinctTags: jest.fn(),
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
        limit: 12,
      });

      const result = await controller.findAll(undefined, 1, 12, undefined);
      expect(result.items).toHaveLength(1);
      expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
        q: undefined,
        page: 1,
        limit: 12,
        tags: undefined,
      });
    });

    it('should pass search query to service', async () => {
      mockMarketplaceService.findAll.mockResolvedValue({
        items: [{ name: 'Staking', score: 0.9 }],
        total: 1,
        page: 1,
        limit: 12,
      });

      const result = await controller.findAll('staking', 1, 12, undefined);
      expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
        q: 'staking',
        page: 1,
        limit: 12,
        tags: undefined,
      });
      expect(result.items).toHaveLength(1);
    });

    it('should pass tags as array to service', async () => {
      mockMarketplaceService.findAll.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 12,
      });

      await controller.findAll(undefined, undefined, undefined, 'erc20, defi');
      expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
        q: undefined,
        page: undefined,
        limit: undefined,
        tags: ['erc20', 'defi'],
      });
    });
  });

  describe('findOne', () => {
    it('should return template details', async () => {
      mockMarketplaceService.findOne.mockResolvedValue({
        _id: 'tmpl-1',
        name: 'Token',
      });

      const result = await controller.findOne('tmpl-1');
      expect(result.name).toBe('Token');
    });
  });

  describe('redeploy', () => {
    it('should return compile result from template', async () => {
      mockMarketplaceService.redeploy.mockResolvedValue({
        abi: [{ type: 'constructor', inputs: [] }],
        bytecode: '0xabcd',
        sources: { 'A.sol': { content: 'code' } },
        contractName: 'A',
        constructorArgs: { name: 'New' },
        templateId: 'tmpl-1',
      });

      const result = await controller.redeploy(
        'tmpl-1',
        { constructorArgs: { name: 'New' }, projectId: undefined },
        'user-1',
      );
      expect(result.abi).toBeDefined();
      expect(result.bytecode).toBe('0xabcd');
      expect(result.templateId).toBe('tmpl-1');
    });
  });

  describe('getTags', () => {
    it('should return distinct tags with counts', async () => {
      mockMarketplaceService.getDistinctTags.mockResolvedValue([
        { tag: 'erc20', count: 10 },
        { tag: 'defi', count: 5 },
      ]);

      const result = await controller.getTags();
      expect(result).toEqual([
        { tag: 'erc20', count: 10 },
        { tag: 'defi', count: 5 },
      ]);
      expect(mockMarketplaceService.getDistinctTags).toHaveBeenCalled();
    });
  });
});
