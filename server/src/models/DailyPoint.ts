import mongoose, { Schema, Document } from 'mongoose';

export interface OrderItem {
  productCode: string;  // 产品型号
  quantity: number;     // 数量
  unitPoints?: number;  // 单个产品积分（如果有）
  comboPoints?: number; // 组合积分（如果匹配到组合）
  points: number;       // 该项获得的积分
}

export interface DailyPointDocument extends Document {
  date: Date;  // 日期
  orderNumber?: string;  // 订单编号
  orderDate?: Date;     // 订单日期
  items: OrderItem[];   // 订单项
  totalPoints: number;  // 总积分
  matchedCombos: string[];  // 匹配到的组合名称
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<OrderItem>({
  productCode: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPoints: { type: Number, default: 0 },
  comboPoints: { type: Number, default: 0 },
  points: { type: Number, required: true, default: 0 }
});

const DailyPointSchema = new Schema<DailyPointDocument>({
  date: { type: Date, required: true, index: true },
  orderNumber: { type: String, index: true },
  orderDate: { type: Date },
  items: { type: [OrderItemSchema], required: true, default: [] },
  totalPoints: { type: Number, required: true, default: 0 },
  matchedCombos: { type: [String], default: [] }
}, { timestamps: true });

// 复合索引：日期和订单编号
DailyPointSchema.index({ date: 1, orderNumber: 1 }, { unique: true });

export default mongoose.model<DailyPointDocument>('DailyPoint', DailyPointSchema, 'dailyPoints');

