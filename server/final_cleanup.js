const mongoose = require('mongoose');

// 連接到數據庫
const connectDB = async () => {
  try {
    const mongoURI = 'mongodb://localhost:27017/Storage';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB 連接成功');
  } catch (error) {
    console.error('❌ MongoDB 連接失敗:', error);
    process.exit(1);
  }
};

// Location 模型
const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true }
}, { timestamps: true });

const Location = mongoose.model('Location', LocationSchema);

// 最終清理函數
const finalCleanup = async () => {
  try {
    console.log('🧹 開始最終清理...');
    
    // 刪除所有舊格式門市
    const oldFormats = ['元朗倉(觀塘)', '元朗倉(灣仔)', '元朗倉(荔枝角)'];
    
    for (const name of oldFormats) {
      const result = await Location.deleteMany({ name: name });
      console.log(`🗑️  刪除 "${name}": ${result.deletedCount} 個`);
    }
    
    // 確保新格式門市存在
    const newFormats = ['元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉'];
    
    for (const name of newFormats) {
      const existing = await Location.findOne({ name: name });
      if (!existing) {
        await Location.create({ name: name });
        console.log(`✅ 創建 "${name}"`);
      } else {
        console.log(`⚠️  "${name}" 已存在`);
      }
    }
    
    // 顯示最終門市列表
    const locations = await Location.find({}).sort({ createdAt: 1 });
    console.log('\n🏪 最終門市列表:');
    locations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}"`);
    });
    
    console.log(`\n📊 總計: ${locations.length} 個門市`);
    
  } catch (error) {
    console.error('❌ 清理過程中出錯:', error);
  }
};

// 主函數
const main = async () => {
  await connectDB();
  await finalCleanup();
  await mongoose.disconnect();
  console.log('🔌 數據庫連接已關閉');
  process.exit(0);
};

// 運行腳本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 腳本執行失敗:', error);
    process.exit(1);
  });
}

module.exports = { finalCleanup };
