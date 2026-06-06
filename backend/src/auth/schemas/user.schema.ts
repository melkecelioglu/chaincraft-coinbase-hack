import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class SmartUser extends Document {
  @Prop({ required: true, unique: true })
  walletAddress: string;

  @Prop()
  name: string;

  @Prop()
  username: string;
}

export const SmartUserSchema = SchemaFactory.createForClass(SmartUser);
