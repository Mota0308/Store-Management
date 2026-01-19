import mongoose, { Schema, Document } from 'mongoose';

export type UserType = 'manager' | 'store1' | 'store2' | 'store3' | 'store4' | 'store5';

export interface UserDocument extends Document {
  username: string;
  password: string;
  type: UserType;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): boolean;
}

const UserSchema = new Schema<UserDocument>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 1
  },
  type: {
    type: String,
    required: true,
    enum: ['manager', 'store1', 'store2', 'store3', 'store4', 'store5'],
    index: true
  }
}, { timestamps: true });

// 比較密碼的方法（直接比較明文）
UserSchema.methods.comparePassword = function(candidatePassword: string): boolean {
  return this.password === candidatePassword;
};

export default mongoose.model<UserDocument>('User', UserSchema, 'users');

