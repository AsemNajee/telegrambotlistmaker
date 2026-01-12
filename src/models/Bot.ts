import mongoose, { Schema, Document } from 'mongoose';

export interface IBot extends Document {
  ownerId: number;
  token: string;
  botUsername: string;
  adminGroupId?: number;
  receptionGroupId?: number;
  publishMessage: string;
  columnsCount: number;
  isActive: boolean;
  createdAt: Date;
}

const BotSchema: Schema = new Schema({
  ownerId: { type: Number, required: true },
  token: { type: String, required: true, unique: true },
  botUsername: { type: String, required: true },
  adminGroupId: { type: Number },
  receptionGroupId: { type: Number },
  publishMessage: { type: String, default: '📢 قائمة القنوات المشاركة:' },
  columnsCount: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IBot>('Bot', BotSchema);


