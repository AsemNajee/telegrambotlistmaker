import mongoose, { Schema, Document } from 'mongoose';

export interface IChannel extends Document {
  botId: mongoose.Types.ObjectId;
  channelId: number;
  title: string;
  inviteLink?: string;
  isApproved: boolean;
  createdAt: Date;
}

const ChannelSchema: Schema = new Schema({
  botId: { type: Schema.Types.ObjectId, ref: 'Bot', required: true },
  channelId: { type: Number, required: true },
  title: { type: String, required: true },
  inviteLink: { type: String },
  isApproved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IChannel>('Channel', ChannelSchema);
