import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiBearerAuth()
@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project successfully created' })
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @GetUser('id') userId: string,
  ) {
    return this.projectsService.create({ ...createProjectDto, user: userId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by id' })
  @ApiResponse({ status: 200, description: 'Return project by id' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    const project = await this.projectsService.findOne(id);
    if (String(project.user) !== userId) {
      throw new ForbiddenException('You can only access your own projects');
    }
    return project;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiResponse({ status: 200, description: 'Project successfully deleted' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async delete(@Param('id') id: string, @GetUser('id') userId: string) {
    const project = await this.projectsService.findOne(id);
    if (String(project.user) !== userId) {
      throw new ForbiddenException('You can only delete your own projects');
    }
    return this.projectsService.delete(id);
  }

  @Get('')
  @ApiOperation({ summary: 'Get current user projects' })
  @ApiResponse({ status: 200, description: 'Return user projects' })
  async findUserProjects(@GetUser('id') userId: string) {
    return this.projectsService.findByUser(userId);
  }
}
