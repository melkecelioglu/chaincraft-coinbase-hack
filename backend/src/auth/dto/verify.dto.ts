import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDto {
  @ApiProperty({
    description: 'SIWE message string',
    example: 'localhost wants you to sign in with your Ethereum account...',
  })
  @IsNotEmpty()
  @IsString()
  readonly message: string;

  @ApiProperty({
    description: 'Wallet signature of the SIWE message',
    example: '0x...',
  })
  @IsNotEmpty()
  @IsString()
  readonly signature: string;
}
