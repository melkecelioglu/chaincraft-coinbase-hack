import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { TokensService } from './tokens.service';
import { CreateTokenDto } from './dto/create-token.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TokenType } from './schemas/token.schema';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiBearerAuth()
@ApiTags('Tokens')
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new token' })
  @ApiResponse({ status: 201, description: 'Token successfully created' })
  async create(
    @Body() createTokenDto: CreateTokenDto,
    @GetUser('id') userId: string,
  ) {
    return this.tokensService.create({ ...createTokenDto, user: userId });
  }

  @Get()
  @ApiOperation({ summary: 'Get all tokens by current user' })
  @ApiResponse({ status: 200, description: 'Return all tokens' })
  async findAll(@GetUser('id') userId: string) {
    return this.tokensService.findByUser(userId);
  }

  @Get('type/:type')
  @ApiOperation({ summary: 'Get tokens by type for current user' })
  @ApiResponse({ status: 200, description: 'Return tokens by type' })
  async findByType(@Param('type') type: string, @GetUser('id') userId: string) {
    return this.tokensService.findByUserAndType(userId, type as TokenType);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a token' })
  @ApiResponse({ status: 200, description: 'Token successfully deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not token owner' })
  async delete(@Param('id') id: string, @GetUser('id') userId: string) {
    const token = await this.tokensService.findOne(id);
    if (String(token.user) !== userId) {
      throw new ForbiddenException('You can only delete your own tokens');
    }
    return this.tokensService.delete(id);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get tokens by project for current user' })
  @ApiResponse({ status: 200, description: 'Return tokens by project' })
  async findByProject(
    @Param('projectId') projectId: string,
    @GetUser('id') userId: string,
    @Query('type') type?: TokenType,
  ) {
    if (type) {
      return this.tokensService.findByProjectAndUserAndType(
        projectId,
        userId,
        type,
      );
    }
    return this.tokensService.findByProjectAndUser(projectId, userId);
  }
}
