import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { SolcService } from '../blockchain/solc.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { GeneratedContractService } from './generated-contract.service';
import OpenAI from 'openai';

const CHAT_SYSTEM_PROMPT =
  `You are a blockchain assistant that helps users create and deploy smart contracts.

Tool usage rules:
- CRITICAL: You must ALWAYS use the generateContract tool when the user asks to create, generate, write, or build any contract. NEVER write Solidity code as plain text — always call the generateContract tool. The tool enables deployment features for the user.
- When the user asks to "deploy" a contract: call deployCustomContract or deployERC20 directly.
- When deploying after generateContract, you can call deployCustomContract with empty sources — the backend will use the previously generated contract.
- IMPORTANT: When the user provides constructor arguments (e.g. "Deploy X with constructor args: owner: 0x..., price: 100"), you MUST pass them in the constructorArgs parameter as key-value string pairs. Extract every argument name and value from the user message. Example: constructorArgs: { "owner_": "0x123...", "tokenPrice_": "1000" }
- When calling deployCustomContract with new code (not from generateContract), the "sources" parameter MUST be a map of filenames to objects with a "content" field containing complete Solidity source code.
- For ERC20 tokens, prefer deployERC20 over deployCustomContract.`.trim();

export interface ChatResult {
  message: string;
  responseId: string;
  deployments: Array<{
    contractAddress: string;
    tokenId: string;
    type: string;
  }>;
  pendingDeploys: Array<{
    contractName: string;
    constructorArgs: Record<string, { type: string }>;
    abi?: any[];
    bytecode?: string;
    sources?: Record<string, { content: string }>;
  }>;
}

@Injectable()
export class ToolDispatchService {
  private readonly logger = new Logger(ToolDispatchService.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly solcService: SolcService,
    @Inject(forwardRef(() => MarketplaceService))
    private readonly marketplaceService: MarketplaceService,
    private readonly generatedContractService: GeneratedContractService,
  ) {}

  getTools(): OpenAI.Responses.Tool[] {
    return [
      {
        type: 'function',
        name: 'deployERC20',
        description: 'Deploy an ERC20 token to the blockchain',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Token name' },
            symbol: { type: 'string', description: 'Token symbol' },
            totalSupply: { type: 'number', description: 'Total supply' },
          },
          required: ['name', 'symbol', 'totalSupply'],
          additionalProperties: false,
        },
        strict: true,
      },
      {
        type: 'function',
        name: 'deployCustomContract',
        description: 'Deploy a custom Solidity contract to the blockchain',
        parameters: {
          type: 'object',
          properties: {
            sources: {
              type: 'object',
              description:
                'Solidity source files map. Keys are file names, values are objects with a "content" string field.',
              additionalProperties: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
              },
            },
            contractName: {
              type: 'string',
              description: 'Main contract name',
            },
            constructorArgs: {
              type: 'object',
              description: 'Constructor arguments as key-value string pairs',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['sources', 'contractName', 'constructorArgs'],
        },
        strict: false,
      },
      {
        type: 'function',
        name: 'generateContract',
        description: 'Generate a Solidity smart contract from a description',
        parameters: {
          type: 'object',
          properties: {
            contractDescription: {
              type: 'string',
              description: 'Description of the contract to generate',
            },
          },
          required: ['contractDescription'],
          additionalProperties: false,
        },
        strict: true,
      },
    ];
  }

  async handleChat(
    message: string,
    userId: string,
    projectId?: string,
    previousResponseId?: string,
  ): Promise<ChatResult> {
    const tools = this.getTools();
    const deployments: ChatResult['deployments'] = [];
    const pendingDeploys: ChatResult['pendingDeploys'] = [];

    let response = await this.openAiService.chat(
      message,
      tools,
      previousResponseId,
      CHAT_SYSTEM_PROMPT,
    );

    let usedGenerateTool = false;

    while (response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        if (toolCall.name === 'generateContract') {
          usedGenerateTool = true;
        }
        const args = JSON.parse(toolCall.arguments);
        const output = await this.dispatchToolCall(
          toolCall.name,
          args,
          userId,
          projectId,
          deployments,
          pendingDeploys,
        );

        response = await this.openAiService.submitToolOutput(
          response.responseId,
          toolCall.id,
          JSON.stringify(output),
          tools,
        );
      }
    }

    // Post-process: if AI wrote Solidity as text instead of calling generateContract
    if (!usedGenerateTool && deployments.length === 0) {
      const extractedCode = this.extractSolidityFromText(response.outputText);
      if (extractedCode) {
        this.logger.log(
          'Detected Solidity code in response text — running post-process compilation',
        );
        const contractName = this.extractContractName(extractedCode);

        const compileResult = await this.compileWithRetry(
          extractedCode,
          contractName,
        );

        if (!('error' in compileResult)) {
          await this.generatedContractService.save(
            userId,
            compileResult.sources,
            contractName,
            compileResult.schema,
          );
          pendingDeploys.push({
            contractName,
            constructorArgs: compileResult.schema,
            abi: compileResult.abi,
            bytecode: compileResult.bytecode,
            sources: compileResult.sources,
          });
        }
      }
    }

    return {
      message: response.outputText,
      responseId: response.responseId,
      deployments,
      pendingDeploys,
    };
  }

  async deployCached(
    userId: string,
    _constructorArgs: Record<string, string>,
    _projectId?: string,
  ): Promise<{
    pendingDeploys: ChatResult['pendingDeploys'];
  }> {
    const cached = await this.generatedContractService.findByUser(userId);
    if (!cached) {
      throw new HttpException(
        'No previously generated contract found. Use generateContract first.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const compiled = this.solcService.compile(
      cached.sources,
      cached.contractName,
    );
    const constructorAbi = compiled.abi.find(
      (item: any) => item.type === 'constructor',
    );
    const schema: Record<string, { type: string }> = {};
    if (constructorAbi?.inputs?.length) {
      for (const input of constructorAbi.inputs) {
        schema[input.name] = { type: input.type };
      }
    }

    return {
      pendingDeploys: [
        {
          contractName: cached.contractName,
          constructorArgs: schema,
          abi: compiled.abi,
          bytecode: compiled.bytecode,
          sources: cached.sources,
        },
      ],
    };
  }

  private async dispatchToolCall(
    name: string,
    args: Record<string, any>,
    userId: string,
    projectId: string | undefined,
    _deployments: ChatResult['deployments'],
    pendingDeploys: ChatResult['pendingDeploys'],
  ): Promise<unknown> {
    switch (name) {
      case 'deployERC20': {
        const sources = this.blockchainService.getErc20Sources();
        const compiled = this.solcService.compile(sources, 'ERC20Token');
        pendingDeploys.push({
          contractName: args.name || 'ERC20Token',
          constructorArgs: {
            _name: { type: 'string' },
            _symbol: { type: 'string' },
            _totalSupply: { type: 'uint256' },
          },
          abi: compiled.abi,
          bytecode: compiled.bytecode,
          sources,
        });
        await this.generatedContractService.save(
          userId,
          sources,
          'ERC20Token',
          {
            _name: { type: 'string' },
            _symbol: { type: 'string' },
            _totalSupply: { type: 'uint256' },
          },
        );
        return {
          status: 'compiled',
          message: `ERC20 token "${args.name}" compiled. User needs to deploy from their wallet.`,
          contractName: 'ERC20Token',
        };
      }

      case 'deployCustomContract': {
        let sources = args.sources;
        let contractName = args.contractName;

        if (!this.validateSources(sources)) {
          const cached = await this.generatedContractService.findByUser(userId);
          if (!cached) {
            return {
              error:
                'No previously generated contract found. Use generateContract first or provide sources directly.',
            };
          }
          sources = cached.sources;
          contractName = cached.contractName;
        }

        const compiled = this.solcService.compile(sources, contractName);
        const constructorAbi = compiled.abi.find(
          (item: any) => item.type === 'constructor',
        );
        const schema: Record<string, { type: string }> = {};
        if (constructorAbi?.inputs?.length) {
          for (const input of constructorAbi.inputs) {
            schema[input.name] = { type: input.type };
          }
        }

        pendingDeploys.push({
          contractName,
          constructorArgs: schema,
          abi: compiled.abi,
          bytecode: compiled.bytecode,
          sources,
        });

        return {
          status: 'compiled',
          message: `Contract "${contractName}" compiled. User needs to deploy from their wallet.`,
          contractName,
        };
      }

      case 'generateContract': {
        const code = await this.openAiService.generateContract(
          args.contractDescription,
        );
        const contractName = this.extractContractName(code);

        const compileResult = await this.compileWithRetry(code, contractName);

        if ('error' in compileResult) {
          return compileResult;
        }

        await this.generatedContractService.save(
          userId,
          compileResult.sources,
          contractName,
          compileResult.schema,
        );

        pendingDeploys.push({
          contractName,
          constructorArgs: compileResult.schema,
          abi: compileResult.abi,
          bytecode: compileResult.bytecode,
          sources: compileResult.sources,
        });

        return {
          sources: compileResult.sources,
          contractName,
          constructorArgs: compileResult.schema,
        };
      }

      default:
        this.logger.warn(`Unknown tool call: ${name}`);
        return { error: `Unknown function: ${name}` };
    }
  }

  private async compileWithRetry(
    code: string,
    contractName: string,
    maxRetries: number = 2,
  ): Promise<
    | {
        sources: Record<string, { content: string }>;
        schema: Record<string, { type: string }>;
        abi: any[];
        bytecode: string;
      }
    | { error: string }
  > {
    const fileName = `${contractName}.sol`;
    let currentCode = code;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const sources = { [fileName]: { content: currentCode } };
      try {
        const compiled = this.solcService.compile(sources, contractName);
        // Extract constructor args schema from ABI
        const constructorAbi = compiled.abi.find(
          (item: any) => item.type === 'constructor',
        );
        const schema: Record<string, { type: string }> = {};
        if (constructorAbi?.inputs?.length) {
          for (const input of constructorAbi.inputs) {
            schema[input.name] = { type: input.type };
          }
        }
        return {
          sources,
          schema,
          abi: compiled.abi,
          bytecode: compiled.bytecode,
        };
      } catch (e) {
        const errorMessage = (e as Error).message;
        if (attempt < maxRetries) {
          this.logger.log(
            `Compilation failed (attempt ${attempt + 1}/${maxRetries + 1}), requesting AI fix`,
          );
          currentCode = await this.openAiService.fixCompilationError(
            currentCode,
            errorMessage,
          );
          const newName = this.extractContractName(currentCode);
          if (newName !== contractName) {
            this.logger.warn(
              `AI changed contract name from ${contractName} to ${newName} — using original`,
            );
          }
        } else {
          this.logger.error(
            `Compilation failed after ${maxRetries + 1} attempts: ${errorMessage}`,
          );
          return {
            error: `Solidity compilation failed after ${maxRetries + 1} attempts: ${errorMessage}`,
          };
        }
      }
    }

    return { error: 'Unexpected compile-with-retry state' };
  }

  private validateSources(
    sources: unknown,
  ): sources is Record<string, { content: string }> {
    if (
      !sources ||
      typeof sources !== 'object' ||
      Object.keys(sources).length === 0
    ) {
      return false;
    }
    for (const [, source] of Object.entries(sources as Record<string, any>)) {
      if (
        typeof source?.content !== 'string' ||
        source.content.trim().length === 0
      ) {
        return false;
      }
    }
    return true;
  }

  private extractContractName(solidityCode: string): string {
    const match = solidityCode.match(/\bcontract\s+(\w+)\s*(?:is\b|\{)/);
    return match?.[1] ?? 'Contract';
  }

  private extractSolidityFromText(text: string): string | null {
    const match = text.match(/```solidity\s*([\s\S]*?)\s*```/);
    if (!match) return null;
    const code = match[1].trim();
    if (/pragma solidity/.test(code) && /\bcontract\s+\w+/.test(code)) {
      return code;
    }
    return null;
  }
}
