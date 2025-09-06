import mongoose, { Schema, Document } from 'mongoose';

export interface LocationDocument extends Document {
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema = new Schema<LocationDocument>({
  name: { type: String, required: true, unique: true, index: true }
}, { timestamps: true });

export default mongoose.model<LocationDocument>('Location', LocationSchema); 