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
