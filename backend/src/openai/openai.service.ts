import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const MODEL = 'gpt-5.2';

const SOLIDITY_ANALYZER_PROMPT = `
You are a Solidity code analyzer. When given a smart contract, you must:
1. Analyze the code and identify ALL imports
2. Extract the main contract name and constructor arguments:
   - Look for the constructor function in the main contract
   - Use EXACT parameter names from the constructor (including underscores)
   - If no constructor or no args, use empty object {}
3. For each imported contract:
   - If it's from OpenZeppelin, use the latest stable version
   - Include the full implementation
4. Return ONLY a JSON object with: sources, name, constructorArgs
5. Keep all original formatting, comments, and whitespace in the content
6. Make sure file paths exactly match the import statements
7. The main contract file name must match the actual contract name in the code
`.trim();

const CONTRACT_GENERATOR_PROMPT =
  `You are a Solidity smart contract expert. Create secure, well-documented smart contracts following these rules:
1. Always include SPDX license and pragma
2. Add detailed comments explaining functionality
3. Follow security best practices
4. Include necessary OpenZeppelin imports
5. Return ONLY the Solidity code, no explanations
6. Format code properly with correct indentation`.trim();

const CONTRACT_ENRICHMENT_PROMPT =
  `You are a smart contract analyst. Given Solidity source files and a contract name, generate metadata for a contract marketplace listing.

Return a JSON object with:
1. "description": A clear 1-2 sentence summary of what the contract does and its key features
2. "tags": An array of 3-8 lowercase tags (e.g. "erc20", "staking", "governance", "defi", "nft", "access-control", "burnable", "pausable", "upgradeable")
3. "constructorArgs": An object where each key is a constructor parameter name, and each value is { "type": "solidity type", "description": "what this parameter does" }. If no constructor or no args, use empty object {}.

Return ONLY the JSON object, no markdown.`.trim();

const COMPILATION_FIX_PROMPT =
  `You are a Solidity compiler error fixer. Fix ONLY the compilation error in the provided code.
Rules:
1. Do NOT change the contract's functionality or constructor signature
2. Do NOT add or remove constructor parameters
3. Do NOT rename the contract
4. Fix ONLY what the compiler error identifies
5. Return ONLY the fixed Solidity code, no explanations`.trim();

export interface ChatResponse {
  responseId: string;
  outputText: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

export interface AnalyzeContractResult {
  sources: Record<string, { content: string }>;
  name: string;
  constructorArgs: Record<string, string>;
}

export interface EnrichContractResult {
  description: string;
  tags: string[];
  constructorArgs: Record<string, { type: string; description: string }>;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
    });
  }

  async chat(
    message: string,
    tools: OpenAI.Responses.Tool[],
    previousResponseId?: string,
    instructions?: string,
  ): Promise<ChatResponse> {
    const response = await this.callApi({
      model: MODEL,
      input: message,
      tools,
      ...(instructions && { instructions }),
      ...(previousResponseId && { previous_response_id: previousResponseId }),
    });

    return this.mapToChatResponse(response);
  }

  async submitToolOutput(
    previousResponseId: string,
    toolCallId: string,
    output: string,
    tools: OpenAI.Responses.Tool[],
  ): Promise<ChatResponse> {
    const response = await this.callApi({
      model: MODEL,
      previous_response_id: previousResponseId,
      input: [
        {
          type: 'function_call_output' as const,
          call_id: toolCallId,
          output,
        },
      ],
      tools,
    });

    return this.mapToChatResponse(response);
  }

  async analyzeContract(contractCode: string): Promise<AnalyzeContractResult> {
    const response = await this.callApi({
      model: MODEL,
      instructions: SOLIDITY_ANALYZER_PROMPT,
      input: `Analyze this contract and return the result as JSON:\n\n${contractCode}`,
      text: { format: { type: 'json_object' as const } },
    });

    try {
      return JSON.parse(response.output_text) as AnalyzeContractResult;
    } catch {
      this.logger.error(
        'Failed to parse contract analysis response',
        response.output_text,
      );
      throw new HttpException(
        'Failed to parse contract analysis from OpenAI',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async generateContract(contractDescription: string): Promise<string> {
    const response = await this.callApi({
      model: MODEL,
      instructions: CONTRACT_GENERATOR_PROMPT,
      input: `Create a Solidity smart contract for: ${contractDescription}`,
    });

    const text = response.output_text;
    const codeMatch =
      text.match(/```solidity\s*([\s\S]*?)\s*```/) ||
      text.match(/```\s*([\s\S]*?)\s*```/);

    return (codeMatch?.[1] ?? text).trim();
  }

  async fixCompilationError(
    originalCode: string,
    compilationError: string,
  ): Promise<string> {
    const response = await this.callApi({
      model: MODEL,
      instructions: COMPILATION_FIX_PROMPT,
      input: `The following Solidity code has a compilation error:\n\n\`\`\`solidity\n${originalCode}\n\`\`\`\n\nCompilation error:\n${compilationError}\n\nReturn the fixed code.`,
    });

    const text = response.output_text;
    const codeMatch =
      text.match(/```solidity\s*([\s\S]*?)\s*```/) ||
      text.match(/```\s*([\s\S]*?)\s*```/);

    return (codeMatch?.[1] ?? text).trim();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(
        `Embedding generation failed: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Embedding generation failed',
        HttpStatus.BAD_GATEWAY,
      );
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
      input: `Contract name: ${contractName}\n\nSource code:\n${sourceText}\n\nReturn the result as JSON.`,
      text: { format: { type: 'json_object' as const } },
    });

    try {
      return JSON.parse(response.output_text) as EnrichContractResult;
    } catch {
      this.logger.error(
        'Failed to parse contract enrichment response',
        response.output_text,
      );
      throw new HttpException(
        'Failed to parse contract enrichment from OpenAI',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async callApi(
    params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  ): Promise<OpenAI.Responses.Response> {
    try {
      return await this.openai.responses.create(params);
    } catch (error) {
      this.logger.error(
        `OpenAI API call failed: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'OpenAI service unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private mapToChatResponse(response: OpenAI.Responses.Response): ChatResponse {
    const toolCalls = response.output
      .filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === 'function_call',
      )
      .map((item) => ({
        id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      }));

    return {
      responseId: response.id,
      outputText: response.output_text || '',
      toolCalls,
    };
  }
}
