import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompileDto {
  @ApiProperty({ description: 'Solidity source files map' })
  @IsNotEmpty()
  @IsObject()
  readonly sources: Record<string, { content: string }>;

  @ApiProperty({ description: 'Name of the contract to compile' })
  @IsNotEmpty()
  @IsString()
  readonly contractName: string;
}
