import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContractTemplate } from './schemas/contract-template.schema';
import { OpenAiService } from '../openai/openai.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { SolcService } from '../blockchain/solc.service';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../tokens/schemas/token.schema';

export interface CreateTemplateInput {
  type: string;
  template?: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  contractAddress: string;
  creatorId: string;
  projectId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface RedeployCompileResult {
  abi: any[];
  bytecode: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  constructorArgs: Record<string, string>;
  templateId: string;
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectModel(ContractTemplate.name)
    private readonly templateModel: Model<ContractTemplate>,
    private readonly openAiService: OpenAiService,
    private readonly blockchainService: BlockchainService,
    private readonly solcService: SolcService,
    private readonly tokensService: TokensService,
  ) {}

  private buildEmbeddingText(
    contractName: string,
    description: string,
    tags: string[],
    sources: Record<string, { content: string }>,
  ): string {
    const sourceText = Object.values(sources)
      .map((s) => s.content)
      .join('\n');
    const sourceSummary = sourceText.slice(0, 500);
    return `${contractName} ${description} ${tags.join(' ')} ${sourceSummary}`;
  }

  async createTemplate(input: CreateTemplateInput): Promise<ContractTemplate> {
    const enrichment = await this.openAiService.enrichContract(
      input.sources,
      input.contractName,
    );

    const embeddingText = this.buildEmbeddingText(
      input.contractName,
      enrichment.description,
      enrichment.tags,
      input.sources,
    );
    const embedding = await this.openAiService.generateEmbedding(embeddingText);

    return this.templateModel.create({
      name: input.contractName,
      description: enrichment.description,
      tags: enrichment.tags,
      type: input.type as TokenType,
      template: input.template,
      sources: input.sources,
      contractName: input.contractName,
      constructorArgs: enrichment.constructorArgs,
      originalDeployment: {
        contractAddress: input.contractAddress,
        chain: 'base-sepolia',
        deployedAt: new Date().toISOString(),
      },
      embedding,
      creator: input.creatorId,
      deployCount: 1,
    });
  }

  async findAll(query: {
    q?: string;
    page?: number;
    limit?: number;
    tags?: string[];
  }): Promise<PaginatedResult<ContractTemplate>> {
    const page = query.page || 1;
    const limit = query.limit || 12;
    const skip = (page - 1) * limit;

    // Semantic search mode
    if (query.q) {
      const queryEmbedding = await this.openAiService.generateEmbedding(
        query.q,
      );
      const numCandidates = Math.max(limit * 20, 200);

      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates,
            limit: numCandidates,
          },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      ];

      if (query.tags?.length) {
        pipeline.push({ $match: { tags: { $in: query.tags } } });
      }

      pipeline.push({
        $facet: {
          items: [
            { $skip: skip },
            { $limit: limit },
            { $project: { embedding: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
        },
      });

      const [result] = await this.templateModel.aggregate(pipeline);
      const items = result.items || [];
      const total = result.totalCount?.[0]?.count || 0;

      return { items, total, page, limit };
    }

    // List mode (no search query)
    const filter: Record<string, any> = {};
    if (query.tags?.length) {
      filter.tags = { $in: query.tags };
    }

    const [items, total] = await Promise.all([
      this.templateModel
        .find(filter)
        .sort({ deployCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-embedding')
        .exec(),
      this.templateModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<ContractTemplate> {
    const template = await this.templateModel
      .findById(id)
      .populate('creator', 'username walletAddress')
      .exec();

    if (!template) {
      throw new NotFoundException(`Contract template ${id} not found`);
    }

    return template;
  }

  async redeploy(
    templateId: string,
    constructorArgs: Record<string, string>,
    _userId: string,
    _projectId?: string,
  ): Promise<RedeployCompileResult> {
    const template = await this.findOne(templateId);

    let sources: Record<string, { content: string }>;
    let contractName: string;

    if (template.type === TokenType.ERC20 && template.template === 'erc20') {
      sources = this.blockchainService.getErc20Sources();
      contractName = 'ERC20Token';
    } else {
      sources = template.sources;
      contractName = template.contractName;
    }

    const compiled = this.solcService.compile(sources, contractName);

    await this.templateModel.findByIdAndUpdate(templateId, {
      $inc: { deployCount: 1 },
    });

    return {
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      sources,
      contractName,
      constructorArgs,
      templateId,
    };
  }

  async semanticSearch(
    query: string,
    limit = 10,
  ): Promise<Array<ContractTemplate & { score: number }>> {
    const result = await this.findAll({ q: query, limit, page: 1 });
    return result.items as Array<ContractTemplate & { score: number }>;
  }

  async getDistinctTags(): Promise<Array<{ tag: string; count: number }>> {
    return this.templateModel.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
  }
}
