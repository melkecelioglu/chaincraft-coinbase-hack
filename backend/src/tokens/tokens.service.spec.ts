import { Test, TestingModule } from '@nestjs/testing';
import { TokensService } from './tokens.service';
import { getModelToken } from '@nestjs/mongoose';
import { Token, TokenType } from './schemas/token.schema';
import { NotFoundException } from '@nestjs/common';

const mockToken = {
  _id: '507f1f77bcf86cd799439011',
  type: TokenType.ERC20,
  data: '{"name":"TestToken"}',
  user: '507f1f77bcf86cd799439022',
  project: '507f1f77bcf86cd799439033',
};

function MockModel(dto) {
  Object.assign(this, dto);
  this.save = jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' });
}
MockModel.find = jest.fn().mockReturnValue({
  exec: jest.fn().mockResolvedValue([mockToken]),
  populate: jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([mockToken]),
  }),
});
MockModel.findById = jest.fn().mockReturnValue({
  exec: jest.fn().mockResolvedValue(mockToken),
});
MockModel.findByIdAndDelete = jest.fn().mockReturnValue({
  exec: jest.fn().mockResolvedValue(mockToken),
});

describe('TokensService', () => {
  let service: TokensService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokensService,
        { provide: getModelToken(Token.name), useValue: MockModel },
      ],
    }).compile();

    service = module.get<TokensService>(TokensService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a token', async () => {
      const result = await service.create({
        type: TokenType.ERC20,
        data: '{}',
        user: 'user-id',
        project: 'project-id',
      });

      expect(result).toHaveProperty('_id');
    });
  });

  describe('findByUser', () => {
    it('should return user tokens', async () => {
      MockModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockToken]),
      });

      const result = await service.findByUser('user-id');
      expect(result).toEqual([mockToken]);
      expect(MockModel.find).toHaveBeenCalledWith({ user: 'user-id' });
    });
  });

  describe('findOne', () => {
    it('should return a token', async () => {
      MockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockToken),
      });

      const result = await service.findOne(mockToken._id);
      expect(result).toEqual(mockToken);
    });

    it('should throw NotFoundException if not found', async () => {
      MockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByUserAndType', () => {
    it('should query by user and type', async () => {
      MockModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockToken]),
      });

      const result = await service.findByUserAndType(
        'user-id',
        TokenType.ERC20,
      );
      expect(MockModel.find).toHaveBeenCalledWith({
        user: 'user-id',
        type: TokenType.ERC20,
      });
      expect(result).toEqual([mockToken]);
    });
  });

  describe('delete', () => {
    it('should delete a token', async () => {
      MockModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockToken),
      });

      const result = await service.delete(mockToken._id);
      expect(result).toEqual(mockToken);
    });
  });
});
