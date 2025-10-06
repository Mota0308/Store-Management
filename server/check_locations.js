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

// 檢查門市的函數
const checkLocations = async () => {
  try {
    console.log('🔍 檢查數據庫中的所有門市...');
    
    const locations = await Location.find({}).sort({ createdAt: 1 });
    console.log(`\n📍 找到 ${locations.length} 個門市:`);
    
    locations.forEach((loc, index) => {
      console.log(`  ${index + 1}. "${loc.name}" (ID: ${loc._id})`);
      
      // 檢查是否有問題的名稱
      if (loc.name.includes('  ') || loc.name.startsWith(' ') || loc.name.endsWith(' ')) {
        console.log(`    ⚠️  警告: 門市名稱包含多餘空格!`);
      }
    });
    
    // 檢查是否有重複的門市名稱
    const nameCount = {};
    locations.forEach(loc => {
      const name = loc.name.trim();
      nameCount[name] = (nameCount[name] || 0) + 1;
    });
    
    console.log('\n🔍 檢查重複門市:');
    let hasDuplicates = false;
    Object.entries(nameCount).forEach(([name, count]) => {
      if (count > 1) {
        console.log(`  ❌ 重複門市: "${name}" 出現 ${count} 次`);
        hasDuplicates = true;
      }
    });
    
    if (!hasDuplicates) {
      console.log('  ✅ 沒有重複的門市');
    }
    
    // 檢查是否有相似的門市名稱
    console.log('\n🔍 檢查相似門市名稱:');
    const names = locations.map(loc => loc.name);
    const similarGroups = {};
    
    names.forEach(name => {
      const normalized = name.replace(/[()（）\s]/g, '').toLowerCase();
      if (!similarGroups[normalized]) {
        similarGroups[normalized] = [];
      }
      similarGroups[normalized].push(name);
    });
    
    Object.entries(similarGroups).forEach(([normalized, group]) => {
      if (group.length > 1) {
        console.log(`  ⚠️  相似門市組: ${group.join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error('❌ 檢查門市過程中出錯:', error);
  }
};

// 主函數
const main = async () => {
  await connectDB();
  await checkLocations();
  await mongoose.disconnect();
  console.log('\n🔌 數據庫連接已關閉');
  process.exit(0);
};

// 運行腳本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 腳本執行失敗:', error);
    process.exit(1);
  });
}

module.exports = { checkLocations };
