const mongoose = require('mongoose');

// 連接到數據庫
const MONGODB_URI = 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

async function debugProductCodes() {
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
    
    // 檢查INV-2018是否存在
    console.log('=== 檢查INV-2018產品 ===');
    const inv2018 = await Product.find({ productCode: /INV-2018/ });
    console.log('找到INV-2018產品數量:', inv2018.length);
    
    if (inv2018.length > 0) {
      inv2018.forEach(product => {
        console.log('INV-2018產品:', {
          name: product.name,
          productCode: product.productCode,
          sizes: product.sizes
        });
      });
    }
    
    // 檢查所有包含INV的產品
    console.log('\n=== 檢查所有INV產品 ===');
    const invProducts = await Product.find({ productCode: /INV-/ });
    console.log('找到INV產品數量:', invProducts.length);
    
    invProducts.forEach(product => {
      console.log('INV產品:', {
        name: product.name,
        productCode: product.productCode,
        sizes: product.sizes
      });
    });
    
    // 檢查代碼變體生成
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
    
    const testCodes = ['INV-2018', 'WS-712PK', 'WS-712BU'];
    testCodes.forEach(code => {
      const variants = codeVariants(code);
      console.log(`代碼 ${code} 的變體:`, variants);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('錯誤:', error);
  }
}

debugProductCodes();
