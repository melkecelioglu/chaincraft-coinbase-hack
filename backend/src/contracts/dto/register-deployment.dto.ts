import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeploymentDto {
  @ApiProperty({ description: 'Transaction hash of the deployment' })
  @IsNotEmpty()
  @IsString()
  readonly txHash: string;

  @ApiProperty({ description: 'Deployed contract address' })
  @IsNotEmpty()
  @IsString()
  readonly contractAddress: string;

  @ApiProperty({ description: 'Contract name' })
  @IsNotEmpty()
  @IsString()
  readonly contractName: string;

  @ApiPropertyOptional({ description: 'Solidity source files' })
  @IsOptional()
  @IsObject()
  readonly sources?: Record<string, { content: string }>;

  @ApiPropertyOptional({ description: 'Contract ABI' })
  @IsOptional()
  readonly abi?: any[];

  @ApiPropertyOptional({ description: 'Constructor arguments used' })
  @IsOptional()
  @IsObject()
  readonly constructorArgs?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Project ID to associate with' })
  @IsOptional()
  @IsString()
  readonly projectId?: string;

  @ApiPropertyOptional({ description: 'Factory contract address used for deployment' })
  @IsOptional()
  @IsString()
  readonly factoryAddress?: string;
}
