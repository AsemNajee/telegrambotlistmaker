import mongoose, { Schema, Document } from 'mongoose';

export interface IChannel extends Document {
  botId: mongoose.Types.ObjectId;
  ownerId: number;
  channelId: number;
  title: string;
  inviteLink?: string;
  lastMessageId?: number;
  memberCount: number;
  isApproved: boolean;
  createdAt: Date;
}

const ChannelSchema: Schema = new Schema({
  botId: { type: Schema.Types.ObjectId, ref: 'Bot', required: true },
  ownerId: { type: Number, required: true },
  channelId: { type: Number, required: true },
  title: { type: String, required: true },
  inviteLink: { type: String },
  lastMessageId: { type: Number },
  memberCount: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IChannel>('Channel', ChannelSchema);


