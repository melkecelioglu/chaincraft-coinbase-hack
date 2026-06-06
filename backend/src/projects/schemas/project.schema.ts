import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SmartUser } from '../../auth/schemas/user.schema';

@Schema({ timestamps: true })
export class Project extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SmartUser',
    required: true,
  })
  user: SmartUser;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
