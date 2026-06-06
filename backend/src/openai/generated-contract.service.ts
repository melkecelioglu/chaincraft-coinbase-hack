import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeneratedContract } from './schemas/generated-contract.schema';

@Injectable()
export class GeneratedContractService {
  constructor(
    @InjectModel(GeneratedContract.name)
    private readonly model: Model<GeneratedContract>,
  ) {}

  async save(
    userId: string,
    sources: Record<string, { content: string }>,
    contractName: string,
    constructorArgs: Record<string, any>,
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { userId },
      {
        userId,
        sources,
        contractName,
        constructorArgs,
        createdAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async findByUser(userId: string): Promise<GeneratedContract | null> {
    return this.model.findOne({ userId }).lean().exec();
  }
}
