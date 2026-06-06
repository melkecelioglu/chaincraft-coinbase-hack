import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { TokensModule } from './tokens/tokens.module';
import { ProjectsModule } from './projects/projects.module';
import { OpenAiModule } from './openai/openai.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ContractsModule } from './contracts/contracts.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow('DB_CONNECTION_STRING'),
      }),
    }),
    AuthModule,
    TokensModule,
    ProjectsModule,
    OpenAiModule,
    BlockchainModule,
    ContractsModule,
    MarketplaceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
