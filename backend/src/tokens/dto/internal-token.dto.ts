import { CreateTokenDto } from './create-token.dto';

export interface InternalTokenDto extends CreateTokenDto {
  user: string;
  project?: string;
}
