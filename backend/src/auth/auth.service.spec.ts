import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getModelToken } from '@nestjs/mongoose';
import { SmartUser } from './schemas/user.schema';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

const mockUser = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test User',
  username: 'testuser',
  walletAddress: '0x000000000000000000000000000000000000dEaD',
};

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('https://sepolia.base.org'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(SmartUser.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateNonce', () => {
    it('should return a nonce string', () => {
      const result = service.generateNonce();
      expect(result.nonce).toBeDefined();
      expect(typeof result.nonce).toBe('string');
      expect(result.nonce.length).toBeGreaterThan(0);
    });
  });

  describe('getUserById', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.getUserById('badid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return user profile', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.getUserById(mockUser._id);

      expect(result).toEqual({
        walletAddress: mockUser.walletAddress,
        username: mockUser.username,
        name: mockUser.name,
      });
    });
  });
});
