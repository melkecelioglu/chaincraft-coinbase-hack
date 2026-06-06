import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema()
export class GeneratedContract extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
    index: true,
  })
  userId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  sources: Record<string, { content: string }>;

  @Prop({ required: true })
  contractName: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  constructorArgs: Record<string, any>;

  @Prop({ default: Date.now, expires: 3600 })
  createdAt: Date;
}

export const GeneratedContractSchema =
  SchemaFactory.createForClass(GeneratedContract);
