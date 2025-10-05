const mongoose = require('mongoose');

// 連接到數據庫
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';
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

// 清理並重新創建門市的函數
const cleanAndRecreateLocations = async () => {
  try {
    console.log('🧹 開始清理所有門市...');
    
    // 顯示當前所有門市
    const currentLocations = await Location.find({});
    console.log('📍 當前門市:');
    currentLocations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}" (ID: ${loc._id})`);
    });
    
    // 刪除所有門市
    const deleteResult = await Location.deleteMany({});
    console.log(`🗑️  已刪除 ${deleteResult.deletedCount} 個門市`);
    
    // 重新創建正確的門市（按照指定順序）
    const correctLocations = [
      '觀塘',
      '灣仔',
      '荔枝角',
      '元朗',
      '元朗倉(觀塘)',
      '元朗倉(灣仔)', 
      '元朗倉(荔枝角)',
      '屯門',
      '國内倉'
    ];
    
    console.log('\n🏗️  重新創建門市...');
    for (const name of correctLocations) {
      try {
        const newLocation = new Location({ name: name });
        await newLocation.save();
        console.log(`✅ 成功創建門市: "${name}"`);
      } catch (error) {
        console.error(`❌ 創建門市 "${name}" 失敗:`, error.message);
      }
    }
    
    // 顯示最終的門市列表
    const finalLocations = await Location.find({}).sort({ createdAt: 1 });
    console.log('\n🏪 最終門市列表（按創建順序）:');
    finalLocations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}" (ID: ${loc._id})`);
    });
    
    console.log('\n✅ 門市清理和重建完成！');
    
  } catch (error) {
    console.error('❌ 清理門市過程中出錯:', error);
  }
};

// 主函數
const main = async () => {
  await connectDB();
  await cleanAndRecreateLocations();
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

module.exports = { cleanAndRecreateLocations };
