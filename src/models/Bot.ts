import mongoose, { Schema, Document } from 'mongoose';

export interface IBot extends Document {
  ownerId: number;
  token: string;
  botUsername: string;
  adminGroupId?: number;
  receptionGroupId?: number;
  publishMessage: string;
  publishImage?: string;
  listType: 'buttons' | 'text';
  columnsCount: number;
  nameTemplate: string;
  sortType: 'members_asc' | 'members_desc' | 'name_asc' | 'name_desc' | 'random';
  minMembers: number;
  maxNameLength: number;
  isReceptionEnabled: boolean;
  isAutoBumpEnabled: boolean;
  bumpThreshold: number;
  isCleanNamesEnabled: boolean;
  isPreviewEnabled: boolean;
  protectionAction: 'none' | 'notify_admin' | 'notify_user' | 'remove_and_leave';
  isProtectionEnabled: boolean;
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
  publishImage: { type: String },
  listType: { type: String, default: 'buttons' },
  columnsCount: { type: Number, default: 1 },
  nameTemplate: { type: String, default: '{Name}' },
  sortType: { type: String, default: 'members_desc' },
  minMembers: { type: Number, default: 0 },
  maxNameLength: { type: Number, default: 50 },
  isReceptionEnabled: { type: Boolean, default: true },
  isAutoBumpEnabled: { type: Boolean, default: false },
  bumpThreshold: { type: Number, default: 1 },
  isCleanNamesEnabled: { type: Boolean, default: false },
  isPreviewEnabled: { type: Boolean, default: true },
  protectionAction: { type: String, default: 'notify_admin' },
  isProtectionEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IBot>('Bot', BotSchema);