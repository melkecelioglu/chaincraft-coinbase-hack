import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OpenAiService } from './openai.service';
import { ToolDispatchService } from './tool-dispatch.service';
import { GeneratedContractService } from './generated-contract.service';
import { AssistantController } from './assistant.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import {
  GeneratedContract,
  GeneratedContractSchema,
} from './schemas/generated-contract.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GeneratedContract.name, schema: GeneratedContractSchema },
    ]),
    BlockchainModule,
    forwardRef(() => MarketplaceModule),
  ],
  controllers: [AssistantController],
  providers: [OpenAiService, ToolDispatchService, GeneratedContractService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
