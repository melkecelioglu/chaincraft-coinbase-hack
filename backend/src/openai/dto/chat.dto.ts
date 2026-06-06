import { IsNotEmpty, IsString, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({ description: 'Message to send to the AI assistant' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Project ID for context' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Previous response ID for conversation chaining',
  })
  @IsOptional()
  @IsString()
  previousResponseId?: string;
}
