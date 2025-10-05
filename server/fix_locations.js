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

// 修復門市名稱的函數
const fixLocations = async () => {
  try {
    console.log('🔧 開始修復門市名稱...');
    
    // 刪除有問題的門市（名稱中有多餘空格的）
    const problematicNames = [
      '元朗倉( 觀塘)',
      '元朗倉(灣 仔)', 
      '元朗倉(荔枝 角)'
    ];
    
    for (const name of problematicNames) {
      const result = await Location.deleteOne({ name: name });
      if (result.deletedCount > 0) {
        console.log(`🗑️  已刪除有問題的門市: "${name}"`);
      }
    }
    
    // 添加正確的門市名稱
    const correctNames = [
      '元朗倉(觀塘)',
      '元朗倉(灣仔)', 
      '元朗倉(荔枝角)'
    ];
    
    for (const name of correctNames) {
      try {
        const existingLocation = await Location.findOne({ name: name });
        
        if (existingLocation) {
          console.log(`⚠️  門市 "${name}" 已存在，跳過`);
        } else {
          const newLocation = new Location({ name: name });
          await newLocation.save();
          console.log(`✅ 成功添加門市: "${name}"`);
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  門市 "${name}" 已存在（重複鍵錯誤），跳過`);
        } else {
          console.error(`❌ 添加門市 "${name}" 失敗:`, error.message);
        }
      }
    }
    
    // 顯示最終的門市列表
    const finalLocations = await Location.find({}).sort({ name: 1 });
    console.log('\n🏪 最終門市列表:');
    finalLocations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}"`);
    });
    
    console.log('\n✅ 門市修復完成！');
    
  } catch (error) {
    console.error('❌ 修復門市過程中出錯:', error);
  }
};

// 主函數
const main = async () => {
  await connectDB();
  await fixLocations();
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

module.exports = { fixLocations };
