import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './blockchain.service';
import { SolcService } from './solc.service';

@Module({
  imports: [ConfigModule],
  providers: [BlockchainService, SolcService],
  exports: [BlockchainService, SolcService],
})
export class BlockchainModule {}
