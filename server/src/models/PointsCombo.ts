import mongoose, { Schema, Document } from 'mongoose';

export interface PointsComboDocument extends Document {
  name: string;
  description?: string;
  productCodes: string[];  // 组合包含的产品型号（不需要数量）
  comboPoints: number;  // 组合的积分
  createdAt: Date;
  updatedAt: Date;
}

const PointsComboSchema = new Schema<PointsComboDocument>({
  name: { type: String, required: true, index: true },
  description: { type: String },
  productCodes: { type: [String], required: true, default: [] },  // 产品型号数组
  comboPoints: { type: Number, required: true, default: 0, min: 0 }
}, { timestamps: true });

PointsComboSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<PointsComboDocument>('PointsCombo', PointsComboSchema, 'pointsCombos');

