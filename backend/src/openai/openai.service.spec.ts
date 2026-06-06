import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService } from './openai.service';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';

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

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'OPENAI_API_KEY') return 'test-key';
    return key;
  }),
};

function mockCreate(service: OpenAiService): jest.Mock {
  return (service as any).openai.responses.create;
}

function mockEmbeddings(service: OpenAiService): jest.Mock {
  return (service as any).openai.embeddings.create;
}

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
    it('should call responses.create and return ChatResponse', async () => {
      const mockResponse = {
        id: 'resp_123',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Hello!' }],
          },
        ],
        output_text: 'Hello!',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.chat('Hello', []);
      expect(result.responseId).toBe('resp_123');
      expect(result.outputText).toBe('Hello!');
      expect(result.toolCalls).toEqual([]);
    });

    it('should extract tool calls from response', async () => {
      const mockResponse = {
        id: 'resp_456',
        output: [
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'deployERC20',
            arguments: '{"name":"Test"}',
          },
        ],
        output_text: '',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.chat('Deploy token', []);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('deployERC20');
    });

    it('should pass previousResponseId when provided', async () => {
      const mockResponse = {
        id: 'resp_789',
        output: [],
        output_text: 'Continued',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      await service.chat('Continue', [], 'resp_prev');
      expect(mockCreate(service)).toHaveBeenCalledWith(
        expect.objectContaining({
          previous_response_id: 'resp_prev',
        }),
      );
    });

    it('should throw HttpException when API call fails', async () => {
      mockCreate(service).mockRejectedValue(new Error('API error'));

      await expect(service.chat('Hello', [])).rejects.toThrow(HttpException);
    });
  });

  describe('submitToolOutput', () => {
    it('should submit tool output and return response', async () => {
      const mockResponse = {
        id: 'resp_789',
        output: [],
        output_text: 'Deployed successfully!',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.submitToolOutput(
        'resp_123',
        'call_1',
        '{"contractAddress":"0x"}',
        [],
      );
      expect(result.outputText).toBe('Deployed successfully!');
      expect(mockCreate(service)).toHaveBeenCalledWith(
        expect.objectContaining({
          previous_response_id: 'resp_123',
          input: [
            {
              type: 'function_call_output',
              call_id: 'call_1',
              output: '{"contractAddress":"0x"}',
            },
          ],
        }),
      );
    });
  });

  describe('analyzeContract', () => {
    it('should return parsed JSON from structured output', async () => {
      const jsonResult = {
        sources: { 'Hello.sol': { content: 'pragma solidity ^0.8.0;' } },
        name: 'Hello',
        constructorArgs: {},
      };
      const mockResponse = { output_text: JSON.stringify(jsonResult) };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.analyzeContract('pragma solidity ^0.8.0;');
      expect(result).toEqual(jsonResult);
    });

    it('should throw HttpException on malformed JSON', async () => {
      const mockResponse = { output_text: 'not valid json {{{' };
      mockCreate(service).mockResolvedValue(mockResponse);

      await expect(
        service.analyzeContract('pragma solidity ^0.8.0;'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('generateContract', () => {
    it('should extract code from solidity markdown block', async () => {
      const mockResponse = {
        output_text:
          '```solidity\n// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Hello {}\n```',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.generateContract('a simple hello contract');
      expect(result).toContain('pragma solidity');
      expect(result).not.toContain('```');
    });

    it('should extract code from generic markdown block', async () => {
      const mockResponse = {
        output_text: '```\npragma solidity ^0.8.0;\ncontract Generic {}\n```',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.generateContract('a generic contract');
      expect(result).toContain('contract Generic');
      expect(result).not.toContain('```');
    });

    it('should return raw text if no code block', async () => {
      const mockResponse = {
        output_text:
          '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Raw {}',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.generateContract('raw contract');
      expect(result).toContain('contract Raw');
    });
  });

  describe('fixCompilationError', () => {
    it('should send original code and error to AI and return fixed code', async () => {
      const mockResponse = {
        output_text:
          '```solidity\n// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Fixed { function _exists(uint256 id) internal pure returns (bool) { return id > 0; } }\n```',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.fixCompilationError(
        'contract Broken { function _exists() {} function _exists(uint256) {} }',
        'TypeError: No unique declaration found',
      );
      expect(result).toContain('contract Fixed');
      expect(result).not.toContain('```');
      expect(mockCreate(service)).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: expect.stringContaining(
            'Fix ONLY the compilation error',
          ),
          input: expect.stringContaining(
            'TypeError: No unique declaration found',
          ),
        }),
      );
    });

    it('should return raw text if no code block in response', async () => {
      const mockResponse = {
        output_text:
          '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Fixed {}',
      };
      mockCreate(service).mockResolvedValue(mockResponse);

      const result = await service.fixCompilationError(
        'broken code',
        'some error',
      );
      expect(result).toContain('contract Fixed');
    });
  });

  describe('generateEmbedding', () => {
    it('should return embedding array from OpenAI', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddings(service).mockResolvedValue({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const result = await service.generateEmbedding('test text');
      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddings(service)).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test text',
        dimensions: 1536,
      });
    });

    it('should throw HttpException when embedding fails', async () => {
      mockEmbeddings(service).mockRejectedValue(new Error('API error'));

      await expect(service.generateEmbedding('test')).rejects.toThrow(
        HttpException,
      );
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

      await expect(service.enrichContract({}, 'Bad')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
