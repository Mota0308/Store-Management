const mongoose = require('mongoose');

// 連接到數據庫
const MONGODB_URI = 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

async function testDatabaseQuery() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
    console.log('MongoDB connected');
    
    // 定義 Product 模型
    const ProductSchema = new mongoose.Schema({
      name: String,
      productCode: String,
      productType: String,
      sizes: [String],
      price: Number,
      imageUrl: String,
      inventories: [{
        locationId: mongoose.Schema.Types.ObjectId,
        quantity: Number
      }]
    }, { timestamps: true });
    
    const Product = mongoose.model('Product', ProductSchema, 'products');
    
    // 測試查詢 WS-409PBK/LB
    const variants = ['WS-409PBK/LB', 'WS-409', 'WS-409PBK/L', 'WS-409PBK/', 'WS-409PBK', 'WS409PBK/LB'];
    console.log('查詢變體:', variants);
    
    const product = await Product.findOne({ productCode: { $in: variants } });
    console.log('查詢結果:', product ? `找到產品 ${product.productCode}` : '未找到產品');
    
    if (product) {
      console.log('產品詳情:', {
        name: product.name,
        productCode: product.productCode,
        productType: product.productType,
        sizes: product.sizes,
        price: product.price
      });
    }
    
    // 直接查詢原始代碼
    const directProduct = await Product.findOne({ productCode: 'WS-409PBK/LB' });
    console.log('直接查詢結果:', directProduct ? `找到產品 ${directProduct.productCode}` : '未找到產品');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('錯誤:', error);
  }
}

testDatabaseQuery();
