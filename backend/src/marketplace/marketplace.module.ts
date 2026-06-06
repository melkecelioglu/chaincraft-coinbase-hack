import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContractTemplate,
  ContractTemplateSchema,
} from './schemas/contract-template.schema';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { OpenAiModule } from '../openai/openai.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContractTemplate.name, schema: ContractTemplateSchema },
    ]),
    forwardRef(() => OpenAiModule),
    BlockchainModule,
    TokensModule,
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
