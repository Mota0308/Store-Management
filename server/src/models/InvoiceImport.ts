import mongoose, { Schema, Document } from 'mongoose';

export interface InvoiceItem {
  productCode: string;
  quantity: number;
  productId?: mongoose.Types.ObjectId;  // 匹配到的产品ID
}

export interface InvoiceImportDocument extends Document {
  userId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  orderNumber?: string;
  orderDate?: Date;
  items: InvoiceItem[];
  processed: number;  // 处理的产品数量
  matched: number;    // 匹配成功的数量
  updated: number;    // 更新的数量
  notFound: string[]; // 未找到的产品代码
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema<InvoiceItem>({
  productCode: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' }
});

const InvoiceImportSchema = new Schema<InvoiceImportDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  orderNumber: { type: String, index: true },
  orderDate: { type: Date },
  items: { type: [InvoiceItemSchema], required: true, default: [] },
  processed: { type: Number, default: 0 },
  matched: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  notFound: { type: [String], default: [] }
}, { timestamps: true });

// 复合索引：用户+订单编号（防止重复导入）
InvoiceImportSchema.index({ userId: 1, orderNumber: 1 }, { unique: true, sparse: true });

export default mongoose.model<InvoiceImportDocument>('InvoiceImport', InvoiceImportSchema, 'invoiceImports');

