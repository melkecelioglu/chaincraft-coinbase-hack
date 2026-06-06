import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  generateNonce: jest.fn(),
  verify: jest.fn(),
  getUserById: jest.fn(),
  getWalletBalance: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getNonce', () => {
    it('should return a nonce', () => {
      mockAuthService.generateNonce.mockReturnValue({ nonce: 'abc123' });

      const result = controller.getNonce();
      expect(mockAuthService.generateNonce).toHaveBeenCalled();
      expect(result).toEqual({ nonce: 'abc123' });
    });
  });

  describe('verify', () => {
    it('should call authService.verify with message and signature', async () => {
      const dto = { message: 'siwe-message', signature: '0xsig' };
      mockAuthService.verify.mockResolvedValue({
        token: 'jwt',
        walletAddress: '0x123',
      });

      const result = await controller.verify(dto);

      expect(mockAuthService.verify).toHaveBeenCalledWith(
        'siwe-message',
        '0xsig',
      );
      expect(result).toEqual({ token: 'jwt', walletAddress: '0x123' });
    });
  });

  describe('getProfile', () => {
    it('should call authService.getUserById', async () => {
      mockAuthService.getUserById.mockResolvedValue({
        walletAddress: '0x123',
        name: 'Test',
      });

      const result = await controller.getProfile('user-id');

      expect(mockAuthService.getUserById).toHaveBeenCalledWith('user-id');
      expect(result).toEqual({ walletAddress: '0x123', name: 'Test' });
    });
  });

  describe('getBalance', () => {
    it('should call authService.getWalletBalance', async () => {
      mockAuthService.getWalletBalance.mockResolvedValue({ balance: '1.5' });

      const result = await controller.getBalance('user-id');

      expect(mockAuthService.getWalletBalance).toHaveBeenCalledWith('user-id');
      expect(result).toEqual({ balance: '1.5' });
    });
  });
});
