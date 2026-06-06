import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { SolcService } from '../blockchain/solc.service';
import { ContractAnalysisService } from './contract-analysis.service';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../tokens/schemas/token.schema';
import { AnalyzeContractDto } from './dto/analyze-contract.dto';
import { DeployContractDto } from './dto/deploy-contract.dto';
import { CompileDto } from './dto/compile.dto';
import { RegisterDeploymentDto } from './dto/register-deployment.dto';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  private readonly logger = new Logger(ContractsController.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly solcService: SolcService,
    private readonly contractAnalysisService: ContractAnalysisService,
    private readonly tokensService: TokensService,
  ) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze Solidity contract and generate sources object',
  })
  @ApiResponse({ status: 200, description: 'Contract analyzed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid contract code' })
  async analyze(@Body() dto: AnalyzeContractDto) {
    this.contractAnalysisService.validateSyntax(dto.contractCode);
    return this.openAiService.analyzeContract(dto.contractCode);
  }

  @Post('compile')
  @ApiOperation({
    summary: 'Compile Solidity sources and return ABI + bytecode',
  })
  @ApiResponse({ status: 200, description: 'Contract compiled successfully' })
  @ApiResponse({ status: 400, description: 'Compilation failed' })
  async compile(@Body() dto: CompileDto) {
    try {
      const { abi, bytecode, compilerVersion } = this.solcService.compile(
        dto.sources,
        dto.contractName,
      );
      return { abi, bytecode, compilerVersion };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register a deployment performed by the frontend wallet',
  })
  @ApiResponse({ status: 201, description: 'Deployment registered' })
  async register(
    @Body() dto: RegisterDeploymentDto,
    @GetUser('id') userId: string,
  ) {
    const token = await this.tokensService.create({
      type: TokenType.CUSTOM_CONTRACT,
      data: JSON.stringify({
        txHash: dto.txHash,
        contractAddress: dto.contractAddress,
        contractName: dto.contractName,
        sources: dto.sources,
        abi: dto.abi,
        constructorArgs: dto.constructorArgs,
        deployedAt: new Date().toISOString(),
      }),
      user: userId,
      project: dto.projectId,
    });

    this.logger.log(
      `Registered deployment ${dto.contractAddress} for user ${userId}`,
    );

    // Fire-and-forget Basescan verification
    if (dto.sources && dto.contractName) {
      const compilerVersion = this.solcService.getCompilerVersion();
      this.blockchainService
        .verifyContract({
          contractAddress: dto.contractAddress,
          sources: dto.sources,
          contractName: dto.contractName,
          compilerVersion,
          constructorArgs: dto.constructorArgs,
          abi: dto.abi,
        })
        .catch((err) =>
          this.logger.error('Basescan verification failed', {
            message: (err as Error).message,
          }),
        );
    }

    return {
      tokenId: String(token._id),
      contractAddress: dto.contractAddress,
      contractName: dto.contractName,
    };
  }

  @Post('deploy')
  @ApiOperation({
    summary:
      'Compile a contract (template or custom Solidity) and return bytecode for frontend deploy',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract compiled, ready for frontend deploy',
  })
  @ApiResponse({ status: 400, description: 'Invalid deploy request' })
  async deploy(@Body() dto: DeployContractDto, @GetUser('id') _userId: string) {
    if (!dto.template && !dto.sources) {
      throw new BadRequestException(
        'Either "template" or "sources" must be provided',
      );
    }
    if (dto.template && dto.sources) {
      throw new BadRequestException(
        'Provide either "template" or "sources", not both',
      );
    }

    if (dto.template === 'erc20') {
      if (!dto.params) {
        throw new BadRequestException('params required for erc20 template');
      }
      const sources = this.blockchainService.getErc20Sources();
      const { abi, bytecode, compilerVersion } = this.solcService.compile(
        sources,
        'ERC20Token',
      );

      return {
        abi,
        bytecode,
        compilerVersion,
        sources,
        contractName: 'ERC20Token',
      };
    }

    // Custom compile
    if (!dto.contractName) {
      throw new BadRequestException('contractName required for custom deploy');
    }

    try {
      const { abi, bytecode, compilerVersion } = this.solcService.compile(
        dto.sources,
        dto.contractName,
      );

      return {
        abi,
        bytecode,
        compilerVersion,
        sources: dto.sources,
        contractName: dto.contractName,
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deployed contract details' })
  @ApiResponse({ status: 200, description: 'Contract details' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async findOne(@Param('id') id: string) {
    const token = await this.tokensService.findOne(id);
    return {
      id: String(token._id),
      type: token.type,
      data: JSON.parse(token.data),
      user: String(token.user),
      project: token.project ? String(token.project) : null,
    };
  }
}
