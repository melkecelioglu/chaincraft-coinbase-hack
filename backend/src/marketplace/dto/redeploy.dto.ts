import { IsObject, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RedeployDto {
  @ApiProperty({ description: 'Constructor arguments for the contract' })
  @IsObject()
  constructorArgs: Record<string, string>;

  @ApiPropertyOptional({ description: 'Project ID to associate deploy with' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
