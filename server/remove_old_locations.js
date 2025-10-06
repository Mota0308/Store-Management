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

// 刪除舊格式門市並添加新格式門市的函數
const updateLocations = async () => {
  try {
    console.log('🔧 開始更新門市列表...');
    
    // 要刪除的舊格式門市
    const oldLocations = [
      '元朗倉(觀塘)',
      '元朗倉(灣仔)',
      '元朗倉(荔枝角)'
    ];
    
    // 要添加的新格式門市
    const newLocations = [
      '元朗觀塘倉',
      '元朗灣仔倉',
      '元朗荔枝角倉'
    ];
    
    console.log('\n🗑️  刪除舊格式門市...');
    for (const locationName of oldLocations) {
      const result = await Location.deleteOne({ name: locationName });
      if (result.deletedCount > 0) {
        console.log(`✅ 已刪除: "${locationName}"`);
      } else {
        console.log(`⚠️  未找到: "${locationName}"`);
      }
    }
    
    console.log('\n🏗️  添加新格式門市...');
    for (const locationName of newLocations) {
      try {
        const existingLocation = await Location.findOne({ name: locationName });
        
        if (existingLocation) {
          console.log(`⚠️  門市 "${locationName}" 已存在，跳過`);
        } else {
          const newLocation = new Location({ name: locationName });
          await newLocation.save();
          console.log(`✅ 成功添加: "${locationName}"`);
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  門市 "${locationName}" 已存在（重複鍵錯誤），跳過`);
        } else {
          console.error(`❌ 添加門市 "${locationName}" 失敗:`, error.message);
        }
      }
    }
    
    // 顯示最終的門市列表
    const finalLocations = await Location.find({}).sort({ createdAt: 1 });
    console.log('\n🏪 最終門市列表:');
    finalLocations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}"`);
    });
    
    console.log('\n✅ 門市更新完成！');
    
  } catch (error) {
    console.error('❌ 更新門市過程中出錯:', error);
  }
};

// 主函數
const main = async () => {
  await connectDB();
  await updateLocations();
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

module.exports = { updateLocations };
