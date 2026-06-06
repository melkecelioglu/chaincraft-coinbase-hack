import { CreateProjectDto } from './create-project.dto';

export interface InternalProjectDto extends CreateProjectDto {
  user: string;
}
