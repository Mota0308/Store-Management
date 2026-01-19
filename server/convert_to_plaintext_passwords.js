const mongoose = require('mongoose');
require('dotenv').config({ path: './local.env' });

const MONGODB_URI = process.env.RAILWAY_MONGODB_URI || 
  'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

// 測試賬號的明文密碼
const testUsers = [
  { username: 'admin', password: 'admin123' },
  { username: 'testuser', password: 'test123' },
  { username: 'manager', password: 'manager123' }
];

async function convertToPlaintext() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
    console.log('✅ 已連接到 MongoDB 生產數據庫\n');
    console.log('🔄 開始將所有用戶密碼轉換為明文...\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    for (const { username, password } of testUsers) {
      const user = await usersCollection.findOne({ username });
      
      if (!user) {
        console.log(`❌ ${username}: 用戶不存在`);
        continue;
      }

      console.log(`處理用戶: ${username}...`);

      // 直接設置明文密碼
      await usersCollection.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: password,  // 直接使用明文
            updatedAt: new Date()
          } 
        }
      );
      
      // 驗證
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      if (updatedUser.password === password) {
        console.log(`✅ ${username}: 密碼已轉換為明文 (${password})`);
      } else {
        console.log(`❌ ${username}: 密碼轉換失敗`);
      }
      console.log('');
    }

    console.log('✅ 所有密碼已轉換為明文');
    console.log('\n📝 測試賬號（明文密碼）:');
    testUsers.forEach(u => {
      console.log(`   用戶名: ${u.username}, 密碼: ${u.password}`);
    });
    console.log('\n⚠️  警告: 密碼現在以明文形式存儲，請確保數據庫安全！');
    
  } catch (error) {
    console.error('❌ 錯誤:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

convertToPlaintext();

