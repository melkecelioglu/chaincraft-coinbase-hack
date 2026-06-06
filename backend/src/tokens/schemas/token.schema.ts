import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Project } from '../../projects/schemas/project.schema';
import { SmartUser } from '../../auth/schemas/user.schema';

export enum TokenType {
  ERC20 = 'erc20',
  CUSTOM_CONTRACT = 'custom-contract',
}

@Schema({ timestamps: true })
export class Token extends Document {
  @Prop({ required: true, enum: TokenType })
  type: TokenType;

  @Prop({ required: true })
  data: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
  })
  user: SmartUser;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Project',
    required: false,
  })
  project: Project;
}

export const TokenSchema = SchemaFactory.createForClass(Token);
