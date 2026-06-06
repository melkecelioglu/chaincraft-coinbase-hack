import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ToolDispatchService } from './tool-dispatch.service';
import { ChatDto } from './dto/chat.dto';
import { DeployCachedDto } from './dto/deploy-cached.dto';

@ApiTags('Assistants')
@ApiBearerAuth()
@Controller('assistants')
export class AssistantController {
  constructor(private readonly toolDispatchService: ToolDispatchService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Chat with AI assistant — can deploy contracts and generate code',
  })
  @ApiResponse({
    status: 200,
    description: 'Assistant response with optional deployments',
  })
  async chat(@Body() dto: ChatDto, @GetUser('id') userId: string) {
    return this.toolDispatchService.handleChat(
      dto.message,
      userId,
      dto.projectId,
      dto.previousResponseId,
    );
  }

  @Post('deploy-cached')
  @ApiOperation({
    summary: 'Deploy the most recently generated contract with given args',
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment result with contract address',
  })
  async deployCached(
    @Body() dto: DeployCachedDto,
    @GetUser('id') userId: string,
  ) {
    return this.toolDispatchService.deployCached(
      userId,
      dto.constructorArgs,
      dto.projectId,
    );
  }
}
