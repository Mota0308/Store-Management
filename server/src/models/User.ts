import mongoose, { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
  username: string;
  email: string;
  password: string;
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
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, '請輸入有效的電子郵件地址']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  }
}, { timestamps: true });

// 比較密碼的方法（直接比較明文）
UserSchema.methods.comparePassword = function(candidatePassword: string): boolean {
  return this.password === candidatePassword;
};

export default mongoose.model<UserDocument>('User', UserSchema, 'users');

