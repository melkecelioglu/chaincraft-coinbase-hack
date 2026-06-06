import { IsNotEmpty, IsObject, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeployCachedDto {
  @ApiProperty({
    description: 'Constructor arguments as key-value string pairs',
  })
  @IsNotEmpty()
  @IsObject()
  constructorArgs: Record<string, string>;

  @ApiPropertyOptional({ description: 'Project ID for context' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
