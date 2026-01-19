import mongoose, { Schema, Document } from 'mongoose';

export interface RestockSettingDocument extends Document {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  threshold: number;  // 補貨提醒閾值
  isRestocked: boolean;  // 是否已補貨
  restockedAt?: Date;  // 補貨時間
  createdAt: Date;
  updatedAt: Date;
}

const RestockSettingSchema = new Schema<RestockSettingDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  threshold: { type: Number, required: true, default: 0 },
  isRestocked: { type: Boolean, default: false },
  restockedAt: { type: Date }
}, { timestamps: true });

// 複合索引：用戶+產品+地點
RestockSettingSchema.index({ userId: 1, productId: 1, locationId: 1 }, { unique: true });

export default mongoose.model<RestockSettingDocument>('RestockSetting', RestockSettingSchema, 'restockSettings');

