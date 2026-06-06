import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenType } from '../schemas/token.schema';

export class CreateTokenDto {
  @ApiProperty({
    example: 'erc20',
    description: 'Type of the token',
    enum: TokenType,
    enumName: 'TokenType',
  })
  @IsNotEmpty()
  @IsEnum(TokenType)
  type: TokenType;

  @ApiProperty({
    example: 'sk-1234567890',
    description: 'Token data',
  })
  @IsNotEmpty()
  @IsString()
  data: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'Project ID (optional)',
  })
  @IsOptional()
  @IsMongoId()
  project?: string;
}
