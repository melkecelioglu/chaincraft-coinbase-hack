import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsOptional,
  IsNumber,
  IsMongoId,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ERC20Params {
  @ApiProperty({ description: 'Token name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token symbol' })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Total supply' })
  @IsNotEmpty()
  @IsNumber()
  totalSupply: number;
}

export class DeployContractDto {
  // --- Template deploy ---
  @ApiPropertyOptional({
    description: 'Template name (e.g. "erc20")',
    enum: ['erc20'],
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ description: 'Template parameters' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ERC20Params)
  @ValidateIf((o) => o.template !== undefined)
  params?: ERC20Params;

  // --- Custom deploy ---
  @ApiPropertyOptional({ description: 'Solidity source files' })
  @IsOptional()
  @IsObject()
  sources?: Record<string, { content: string }>;

  @ApiPropertyOptional({ description: 'Contract name' })
  @IsOptional()
  @IsString()
  contractName?: string;

  @ApiPropertyOptional({ description: 'Constructor arguments' })
  @IsOptional()
  @IsObject()
  constructorArgs?: Record<string, string>;

  // --- Common ---
  @ApiPropertyOptional({ description: 'Project ID to associate with' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
