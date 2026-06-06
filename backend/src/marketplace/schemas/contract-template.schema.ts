import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SmartUser } from '../../auth/schemas/user.schema';
import { TokenType } from '../../tokens/schemas/token.schema';

@Schema({ timestamps: true })
export class ContractTemplate extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], required: true })
  tags: string[];

  @Prop({ required: true, enum: TokenType })
  type: TokenType;

  @Prop()
  template: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  sources: Record<string, { content: string }>;

  @Prop({ required: true })
  contractName: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  constructorArgs: Record<string, { type: string; description: string }>;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  originalDeployment: {
    contractAddress: string;
    chain: string;
    deployedAt: string;
  };

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
  })
  creator: SmartUser;

  @Prop({ default: 1 })
  deployCount: number;
}

export const ContractTemplateSchema =
  SchemaFactory.createForClass(ContractTemplate);
