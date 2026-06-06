import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    example: 'My Smart Contract Project',
    description: 'Name of the project',
  })
  @IsNotEmpty()
  @IsString()
  name: string;
}
