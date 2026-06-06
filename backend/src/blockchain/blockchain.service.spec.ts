import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainService } from './blockchain.service';
import { ConfigService } from '@nestjs/config';
import { SolcService } from './solc.service';
import { HttpException } from '@nestjs/common';

jest.mock('ethers', () => {
  const mockContract = {
    waitForDeployment: jest.fn().mockResolvedValue(undefined),
    getAddress: jest.fn().mockReturnValue('0xabc123'),
  };
  const mockContractFactory = jest.fn().mockImplementation(() => ({
    deploy: jest.fn().mockResolvedValue(mockContract),
  }));
  const mockAbiCoder = {
    encode: jest.fn().mockReturnValue('0xabcdef'),
  };
  return {
    ethers: {
      JsonRpcProvider: jest.fn(),
      Wallet: {
        fromPhrase: jest.fn().mockReturnValue({}),
      },
      ContractFactory: mockContractFactory,
      AbiCoder: jest.fn().mockImplementation(() => mockAbiCoder),
    },
  };
});

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('pragma solidity ^0.8.20;'),
}));

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('https://rpc.example.com'),
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'BASESCAN_API_KEY') return 'test-api-key';
    return undefined;
  }),
};

const mockSolcService = {
  compile: jest.fn().mockReturnValue({
    abi: [{ type: 'constructor', inputs: [] }],
    bytecode: '0x6080',
    compilerVersion: 'v0.8.28+commit.7893614a',
  }),
  resolveAllSources: jest
    .fn()
    .mockImplementation(
      (sources: Record<string, { content: string }>) => sources,
    ),
};

describe('BlockchainService', () => {
  let service: BlockchainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SolcService, useValue: mockSolcService },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deployToken', () => {
    it('should deploy a token and return contract address', async () => {
      const result = await service.deployToken(
        'TestToken',
        'TT',
        1000000,
        'test test test test test test test test test test test junk',
      );

      expect(result).toEqual({
        contractAddress: '0xabc123',
        compilerVersion: 'v0.8.28+commit.7893614a',
        abi: [{ type: 'constructor', inputs: [] }],
        sources: {
          'ERC20Token.sol': { content: 'pragma solidity ^0.8.20;' },
        },
      });
      expect(mockSolcService.compile).toHaveBeenCalled();
    });

    it('should throw HttpException on failure', async () => {
      mockSolcService.compile.mockImplementationOnce(() => {
        throw new Error('Compilation failed');
      });

      await expect(
        service.deployToken('Test', 'T', 100, 'bad-mnemonic'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deployCustomContract', () => {
    it('should deploy a custom contract and return address', async () => {
      const sources = {
        'Contract.sol': { content: 'pragma solidity ^0.8.0;' },
      };

      const result = await service.deployCustomContract(
        sources,
        'MyContract',
        { arg1: 'value1' },
        'test test test test test test test test test test test junk',
      );

      expect(result).toEqual({
        contractAddress: '0xabc123',
        compilerVersion: 'v0.8.28+commit.7893614a',
        abi: [{ type: 'constructor', inputs: [] }],
      });
    });

    it('should throw HttpException on failure', async () => {
      mockSolcService.compile.mockImplementationOnce(() => {
        throw new Error('Compile failed');
      });

      await expect(
        service.deployCustomContract({}, 'Bad', {}, 'bad'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verifyContract', () => {
    const sources = {
      'Token.sol': { content: 'contract Token {}' },
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should submit and poll for verification success', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: '1', result: 'guid-123' }),
        })
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ status: '1', result: 'Pass - Verified' }),
        });
      global.fetch = fetchMock;

      const promise = service.verifyContract({
        contractAddress: '0xabc123',
        sources,
        contractName: 'Token',
        compilerVersion: 'v0.8.28+commit.7893614a',
      });

      // Advance past initial delay (15s)
      await jest.advanceTimersByTimeAsync(15_000);
      // Advance past the first poll delay (3s)
      await jest.advanceTimersByTimeAsync(3000);

      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.etherscan.io/v2/api?chainid=84532',
      );
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    it('should not throw on submit failure', async () => {
      const fetchMock = jest.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({ status: '0', result: 'Some other error' }),
      });
      global.fetch = fetchMock;

      const promise = service.verifyContract({
        contractAddress: '0xabc123',
        sources,
        contractName: 'Token',
        compilerVersion: 'v0.8.28+commit.7893614a',
      });

      // Advance past initial delay
      await jest.advanceTimersByTimeAsync(15_000);

      await expect(promise).resolves.not.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not throw on fetch failure', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'));
      global.fetch = fetchMock;

      const promise = service.verifyContract({
        contractAddress: '0xabc123',
        sources,
        contractName: 'Token',
        compilerVersion: 'v0.8.28+commit.7893614a',
      });

      // Advance past initial delay
      await jest.advanceTimersByTimeAsync(15_000);

      await expect(promise).resolves.not.toThrow();
    });

    it('should retry submit when Basescan returns Unable to locate', async () => {
      const fetchMock = jest
        .fn()
        // 1st submit: Unable to locate
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              status: '0',
              result:
                'Unable to locate ContractCode at 0xabc123',
            }),
        })
        // 2nd submit: success
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: '1', result: 'guid-456' }),
        })
        // poll: verified
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ status: '1', result: 'Pass - Verified' }),
        });
      global.fetch = fetchMock;

      const promise = service.verifyContract({
        contractAddress: '0xabc123',
        sources,
        contractName: 'Token',
        compilerVersion: 'v0.8.28+commit.7893614a',
      });

      // Initial delay
      await jest.advanceTimersByTimeAsync(15_000);
      // Retry delay after first "Unable to locate"
      await jest.advanceTimersByTimeAsync(15_000);
      // Poll delay
      await jest.advanceTimersByTimeAsync(3000);

      await promise;

      // 1st submit + 2nd submit + 1 poll = 3 fetch calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should skip verification when API key is missing', async () => {
      mockConfigService.get.mockReturnValueOnce(undefined);

      // Rebuild module without API key
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BlockchainService,
          {
            provide: ConfigService,
            useValue: {
              ...mockConfigService,
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          { provide: SolcService, useValue: mockSolcService },
        ],
      }).compile();

      const svcNoKey = module.get<BlockchainService>(BlockchainService);
      const fetchMock = jest.fn();
      global.fetch = fetchMock;

      await svcNoKey.verifyContract({
        contractAddress: '0xabc123',
        sources,
        contractName: 'Token',
        compilerVersion: 'v0.8.28+commit.7893614a',
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
