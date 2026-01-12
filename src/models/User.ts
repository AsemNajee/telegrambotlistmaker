import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  hasCreatedBot: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  hasCreatedBot: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);
