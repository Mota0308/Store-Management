import mongoose, { Schema, Document } from 'mongoose';

export interface LocationInventory {
  locationId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface ProductDocument extends Document {
  name: string;
  productCode: string;
  productType: string;
  sizes: string[];  // 修复：改回字符串数组
  price: number;
  points?: number;  // 積分
  imageUrl?: string;
  inventories: LocationInventory[];
  createdAt: Date;
  updatedAt: Date;
}

const LocationInventorySchema = new Schema<LocationInventory>({
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  quantity: { type: Number, required: true, default: 0 }
});

const ProductSchema = new Schema<ProductDocument>({
  name: { type: String, required: true, index: true },
  productCode: { type: String, required: true, index: true },
  productType: { type: String, required: true, index: true },
  sizes: { type: [String], required: true, default: [], index: true },
  price: { type: Number, required: true },
  points: { type: Number, default: 0 },
  imageUrl: { type: String },
  inventories: { type: [LocationInventorySchema], default: [] }
}, { timestamps: true });

ProductSchema.index({ name: 'text', productCode: 'text' });

export default mongoose.model<ProductDocument>('Product', ProductSchema, 'products'); 