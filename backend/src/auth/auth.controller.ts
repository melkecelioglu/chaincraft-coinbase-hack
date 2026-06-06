import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { VerifyDto } from './dto/verify.dto';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get('nonce')
  @ApiOperation({ summary: 'Generate SIWE nonce' })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated',
    schema: {
      type: 'object',
      properties: { nonce: { type: 'string' } },
    },
  })
  getNonce() {
    return this.authService.generateNonce();
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Verify SIWE signature and get JWT' })
  @ApiResponse({
    status: 200,
    description: 'Signature verified, JWT returned',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        walletAddress: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid signature or nonce' })
  async verify(@Body() verifyDto: VerifyDto) {
    return this.authService.verify(verifyDto.message, verifyDto.signature);
  }

  @Get('user')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  async getProfile(@GetUser('id') userId: string) {
    return this.authService.getUserById(userId);
  }

  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet ETH balance on Base Sepolia' })
  @ApiResponse({ status: 200, description: 'Wallet balance in ETH' })
  async getBalance(@GetUser('id') userId: string) {
    return this.authService.getWalletBalance(userId);
  }
}
