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
    
    // 查詢所有WS-712相關的產品
    console.log('=== 查詢WS-712系列產品 ===');
    const ws712Products = await Product.find({ productCode: /WS-712/ });
    console.log('找到WS-712產品數量:', ws712Products.length);
    
    ws712Products.forEach(product => {
      console.log('產品:', {
        name: product.name,
        productCode: product.productCode,
        sizes: product.sizes
      });
    });
    
    // 查詢所有包含WS的產品（前10個）
    console.log('\n=== 查詢所有WS產品（前10個）===');
    const wsProducts = await Product.find({ productCode: /WS-/ }).limit(10);
    console.log('找到WS產品數量:', wsProducts.length);
    
    wsProducts.forEach(product => {
      console.log('產品:', {
        name: product.name,
        productCode: product.productCode,
        sizes: product.sizes
      });
    });
    
    // 測試代碼變體生成
    console.log('\n=== 測試代碼變體生成 ===');
    function normalizeCode(s) {
      return (s || '').replace(/[]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
    }
    
    function codeVariants(raw) {
      const n = normalizeCode(raw);
      if (!n) return [];
      const variants = [n];
      if (n.includes('-')) {
        variants.push(n.replace(/-/g, ''));
        variants.push(n.replace(/-/g, ''));
        variants.push(n.replace(/-/g, ''));
      }
      return [...new Set(variants)];
    }
    
    const testCodes = ['WS-712PK', 'WS-712BU', 'WS-712'];
    testCodes.forEach(code => {
      const variants = codeVariants(code);
      console.log(`代碼 ${code} 的變體:`, variants);
      
      // 測試查詢
      const found = Product.findOne({ productCode: { $in: variants } });
      found.then(product => {
        console.log(`  查詢結果: ${product ? '找到 ' + product.productCode : '未找到'}`);
      });
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('錯誤:', error);
  }
}

testDatabaseQuery();
