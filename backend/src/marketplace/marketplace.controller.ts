import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { MarketplaceService } from './marketplace.service';
import { RedeployDto } from './dto/redeploy.dto';

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List or search contract templates' })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Semantic search query',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'tags',
    required: false,
    type: String,
    description: 'Comma-separated tags',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of templates' })
  async findAll(
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tags') tags?: string,
  ) {
    return this.marketplaceService.findAll({
      q: q || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
    });
  }

  @Public()
  @Get('tags')
  @ApiOperation({ summary: 'Get all unique tags with counts' })
  @ApiResponse({ status: 200, description: 'Array of tags with usage counts' })
  async getTags() {
    return this.marketplaceService.getDistinctTags();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get contract template details' })
  @ApiResponse({
    status: 200,
    description: 'Template details with sources and args schema',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id') id: string) {
    return this.marketplaceService.findOne(id);
  }

  @Post(':id/deploy')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Redeploy a contract from template with new parameters',
  })
  @ApiResponse({ status: 201, description: 'Contract deployed from template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async redeploy(
    @Param('id') id: string,
    @Body() dto: RedeployDto,
    @GetUser('id') userId: string,
  ) {
    return this.marketplaceService.redeploy(
      id,
      dto.constructorArgs,
      userId,
      dto.projectId,
    );
  }
}
