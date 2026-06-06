import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeContractDto {
  @ApiProperty({
    description: 'Solidity contract source code',
    example: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;...',
  })
  @IsNotEmpty()
  @IsString()
  contractCode: string;
}
