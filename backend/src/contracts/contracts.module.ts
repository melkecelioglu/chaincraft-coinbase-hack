import { Module } from '@nestjs/common';
import { ContractAnalysisService } from './contract-analysis.service';
import { ContractsController } from './contracts.controller';
import { OpenAiModule } from '../openai/openai.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [OpenAiModule, BlockchainModule, TokensModule],
  controllers: [ContractsController],
  providers: [ContractAnalysisService],
  exports: [ContractAnalysisService],
})
export class ContractsModule {}
