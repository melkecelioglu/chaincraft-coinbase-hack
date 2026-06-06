import { Test, TestingModule } from '@nestjs/testing';
import { ToolDispatchService } from './tool-dispatch.service';
import { OpenAiService } from './openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { SolcService } from '../blockchain/solc.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { GeneratedContractService } from './generated-contract.service';

const mockOpenAiService = {
  chat: jest.fn(),
  submitToolOutput: jest.fn(),
  generateContract: jest.fn(),
  analyzeContract: jest.fn(),
  fixCompilationError: jest.fn(),
};
const mockBlockchainService = {
  getErc20Sources: jest.fn().mockReturnValue({
    'ERC20Token.sol': { content: 'pragma solidity...' },
  }),
  getConstructorArgsSchema: jest.fn(),
};
const mockSolcService = {
  compile: jest.fn(),
};
const mockMarketplaceService = {
  createTemplate: jest.fn().mockResolvedValue({}),
};
const mockGeneratedContractService = {
  save: jest.fn().mockResolvedValue(undefined),
  findByUser: jest.fn().mockResolvedValue(null),
};

describe('ToolDispatchService', () => {
  let service: ToolDispatchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolDispatchService,
        { provide: OpenAiService, useValue: mockOpenAiService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: SolcService, useValue: mockSolcService },
        { provide: MarketplaceService, useValue: mockMarketplaceService },
        {
          provide: GeneratedContractService,
          useValue: mockGeneratedContractService,
        },
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
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: 'Hello!',
        toolCalls: [],
      });

      const result = await service.handleChat('Hello', 'user-id');
      expect(result.message).toBe('Hello!');
      expect(result.deployments).toEqual([]);
      expect(result.pendingDeploys).toEqual([]);
    });

    it('should compile ERC20 and return pendingDeploy instead of deploying', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployERC20',
            arguments:
              '{"name":"TestCoin","symbol":"TC","totalSupply":1000000}',
          },
        ],
      });
      mockSolcService.compile.mockReturnValue({
        abi: [{ type: 'constructor', inputs: [] }],
        bytecode: '0x1234',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Compiled!',
        toolCalls: [],
      });

      const result = await service.handleChat('Deploy a token', 'user-id');
      expect(result.pendingDeploys).toHaveLength(1);
      expect(result.pendingDeploys[0].contractName).toBe('TestCoin');
      expect(result.pendingDeploys[0].abi).toBeDefined();
      expect(result.pendingDeploys[0].bytecode).toBe('0x1234');
      expect(result.deployments).toEqual([]);
    });

    it('should save ERC20 compilation to generated contract cache', async () => {
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
      mockSolcService.compile.mockReturnValue({
        abi: [{ type: 'constructor', inputs: [
          { name: '_name', type: 'string' },
          { name: '_symbol', type: 'string' },
          { name: '_totalSupply', type: 'uint256' },
        ] }],
        bytecode: '0x1234',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Compiled!',
        toolCalls: [],
      });

      await service.handleChat('Deploy a token', 'user-id');
      expect(mockGeneratedContractService.save).toHaveBeenCalledWith(
        'user-id',
        { 'ERC20Token.sol': { content: 'pragma solidity...' } },
        'ERC20Token',
        {
          _name: { type: 'string' },
          _symbol: { type: 'string' },
          _totalSupply: { type: 'uint256' },
        },
      );
    });

    it('should compile custom contract and return pendingDeploy', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployCustomContract',
            arguments:
              '{"sources":{"A.sol":{"content":"code"}},"contractName":"A","constructorArgs":{}}',
          },
        ],
      });
      mockSolcService.compile.mockReturnValue({
        abi: [
          { type: 'constructor', inputs: [{ name: 'owner', type: 'address' }] },
        ],
        bytecode: '0xabcd',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Custom compiled!',
        toolCalls: [],
      });

      const result = await service.handleChat('Deploy custom', 'user-id');
      expect(result.pendingDeploys).toHaveLength(1);
      expect(result.pendingDeploys[0].contractName).toBe('A');
      expect(result.pendingDeploys[0].constructorArgs).toEqual({
        owner: { type: 'address' },
      });
      expect(result.deployments).toEqual([]);
    });

    it('should dispatch generateContract and return structured sources', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'generateContract',
            arguments: '{"contractDescription":"a simple voting contract"}',
          },
        ],
      });
      mockOpenAiService.generateContract.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract Voting {\n  // voting logic\n}',
      );
      mockSolcService.compile.mockReturnValue({
        abi: [{ type: 'function', name: 'vote' }],
        bytecode: '0x5678',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Here is your contract',
        toolCalls: [],
      });

      const result = await service.handleChat(
        'Create voting contract',
        'user-id',
      );
      expect(mockOpenAiService.generateContract).toHaveBeenCalledWith(
        'a simple voting contract',
      );
      expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
        'resp_1',
        'call_1',
        expect.stringContaining('"sources"'),
        expect.anything(),
      );
      // Verify structured format
      const outputArg = mockOpenAiService.submitToolOutput.mock.calls[0][2];
      const parsed = JSON.parse(outputArg);
      expect(parsed.sources).toBeDefined();
      expect(parsed.contractName).toBe('Voting');
      expect(parsed.constructorArgs).toEqual({});
      expect(Object.values(parsed.sources)[0]).toHaveProperty('content');
      expect(mockGeneratedContractService.save).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({
          'Voting.sol': { content: expect.any(String) },
        }),
        'Voting',
        {},
      );
      expect(result.pendingDeploys).toHaveLength(1);
      expect(result.pendingDeploys[0].contractName).toBe('Voting');
      expect(result.pendingDeploys[0].abi).toBeDefined();
      expect(result.pendingDeploys[0].bytecode).toBe('0x5678');
    });

    it('should return error when deployCustomContract sources is empty and no cache', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployCustomContract',
            arguments: '{"sources":{},"contractName":"A","constructorArgs":{}}',
          },
        ],
      });
      mockGeneratedContractService.findByUser.mockResolvedValue(null);
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'No cached contract',
        toolCalls: [],
      });

      await service.handleChat('Deploy custom', 'user-id');
      expect(mockSolcService.compile).not.toHaveBeenCalled();
      expect(mockOpenAiService.submitToolOutput).toHaveBeenCalledWith(
        'resp_1',
        'call_1',
        expect.stringContaining('No previously generated contract found'),
        expect.anything(),
      );
    });

    it('should pass system prompt to chat', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: 'Hello!',
        toolCalls: [],
      });

      await service.handleChat('Hello', 'user-id');
      expect(mockOpenAiService.chat).toHaveBeenCalledWith(
        'Hello',
        expect.any(Array),
        undefined,
        expect.stringContaining('blockchain assistant'),
      );
    });

    it('should fall back to cached sources when deployCustomContract sources are empty', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployCustomContract',
            arguments: '{"sources":{},"contractName":"A","constructorArgs":{}}',
          },
        ],
      });
      mockGeneratedContractService.findByUser.mockResolvedValue({
        sources: {
          'Voting.sol': {
            content: 'pragma solidity ^0.8.0; contract Voting {}',
          },
        },
        contractName: 'Voting',
        constructorArgs: {},
      });
      mockSolcService.compile.mockReturnValue({
        abi: [{ type: 'function', name: 'vote' }],
        bytecode: '0xcache',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Compiled from cache!',
        toolCalls: [],
      });

      const result = await service.handleChat('Deploy it', 'user-id');
      expect(mockGeneratedContractService.findByUser).toHaveBeenCalledWith(
        'user-id',
      );
      expect(mockSolcService.compile).toHaveBeenCalledWith(
        {
          'Voting.sol': {
            content: 'pragma solidity ^0.8.0; contract Voting {}',
          },
        },
        'Voting',
      );
      expect(result.pendingDeploys).toHaveLength(1);
      expect(result.pendingDeploys[0].contractName).toBe('Voting');
    });

    it('should return error when deployCustomContract sources has no content and no cache', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'deployCustomContract',
            arguments:
              '{"sources":{"A.sol":{}},"contractName":"A","constructorArgs":{}}',
          },
        ],
      });
      mockGeneratedContractService.findByUser.mockResolvedValue(null);
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Invalid source',
        toolCalls: [],
      });

      await service.handleChat('Deploy custom', 'user-id');
      expect(mockSolcService.compile).not.toHaveBeenCalled();
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

  describe('compileWithRetry (via generateContract)', () => {
    it('should compile successfully on first attempt and save to cache', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'generateContract',
            arguments: '{"contractDescription":"a token vesting contract"}',
          },
        ],
      });
      mockOpenAiService.generateContract.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract Vesting {\n  constructor(address token_) {}\n}',
      );
      mockSolcService.compile.mockReturnValue({
        abi: [
          {
            type: 'constructor',
            inputs: [{ name: 'token_', type: 'address' }],
          },
        ],
        bytecode: '0xvesting',
        compilerVersion: 'v0.8.20',
      });
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Here is your contract',
        toolCalls: [],
      });

      const result = await service.handleChat(
        'Create vesting contract',
        'user-id',
      );
      expect(mockGeneratedContractService.save).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({ 'Vesting.sol': expect.any(Object) }),
        'Vesting',
        { token_: { type: 'address' } },
      );
      expect(result.pendingDeploys).toHaveLength(1);
      expect(result.pendingDeploys[0].contractName).toBe('Vesting');
      expect(result.pendingDeploys[0].abi).toBeDefined();
      expect(result.pendingDeploys[0].bytecode).toBe('0xvesting');
      expect(mockOpenAiService.fixCompilationError).not.toHaveBeenCalled();
    });

    it('should retry with fixCompilationError when first compile fails', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'generateContract',
            arguments: '{"contractDescription":"a broken contract"}',
          },
        ],
      });
      mockOpenAiService.generateContract.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract Broken {\n  function _exists() {} function _exists(uint256) {}\n}',
      );
      mockSolcService.compile
        .mockImplementationOnce(() => {
          throw new Error('TypeError: No unique declaration found');
        })
        .mockReturnValueOnce({
          abi: [],
          bytecode: '0xfixed',
          compilerVersion: 'v0.8.20',
        });
      mockOpenAiService.fixCompilationError.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract Broken {\n  function _exists(uint256 id) internal pure returns (bool) { return id > 0; }\n}',
      );
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Here is your fixed contract',
        toolCalls: [],
      });

      await service.handleChat('Create contract', 'user-id');
      expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledTimes(1);
      expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledWith(
        expect.stringContaining('contract Broken'),
        'TypeError: No unique declaration found',
      );
      expect(mockGeneratedContractService.save).toHaveBeenCalled();
    });

    it('should return error when all compile retries exhausted', async () => {
      mockOpenAiService.chat.mockResolvedValue({
        responseId: 'resp_1',
        outputText: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'generateContract',
            arguments: '{"contractDescription":"unfixable contract"}',
          },
        ],
      });
      mockOpenAiService.generateContract.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract Unfixable {}',
      );
      mockSolcService.compile.mockImplementation(() => {
        throw new Error('Persistent compilation error');
      });
      mockOpenAiService.fixCompilationError.mockResolvedValue(
        'pragma solidity ^0.8.0;\n\ncontract StillBroken {}',
      );
      mockOpenAiService.submitToolOutput.mockResolvedValue({
        responseId: 'resp_2',
        outputText: 'Sorry, could not compile',
        toolCalls: [],
      });

      await service.handleChat('Create contract', 'user-id');
      expect(mockOpenAiService.fixCompilationError).toHaveBeenCalledTimes(2);
      expect(mockGeneratedContractService.save).not.toHaveBeenCalled();
      // Verify error was returned to AI
      const outputArg = mockOpenAiService.submitToolOutput.mock.calls[0][2];
      const parsed = JSON.parse(outputArg);
      expect(parsed.error).toContain('Persistent compilation error');
    });
  });
});
