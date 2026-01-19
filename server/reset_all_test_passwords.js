const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './local.env' });

const MONGODB_URI = process.env.RAILWAY_MONGODB_URI || 
  'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

const users = [
  { username: 'admin', password: 'admin123' },
  { username: 'testuser', password: 'test123' },
  { username: 'manager', password: 'manager123' }
];

async function resetAllPasswords() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
    console.log('✅ 已連接到 MongoDB 生產數據庫\n');
    console.log('🔄 開始重置所有測試賬號密碼...\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    for (const { username, password } of users) {
      const user = await usersCollection.findOne({ username });
      
      if (!user) {
        console.log(`❌ ${username}: 用戶不存在`);
        continue;
      }

      console.log(`處理用戶: ${username}...`);

      // 重新加密密碼
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // 更新數據庫
      await usersCollection.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          } 
        }
      );
      
      // 驗證
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      const isValid = await bcrypt.compare(password, updatedUser.password);
      
      if (isValid) {
        console.log(`✅ ${username}: 密碼重置成功 (${password})`);
      } else {
        console.log(`❌ ${username}: 密碼重置失敗`);
      }
      console.log('');
    }

    console.log('✅ 所有密碼已重置完成');
    console.log('\n📝 測試賬號:');
    users.forEach(u => {
      console.log(`   用戶名: ${u.username}, 密碼: ${u.password}`);
    });
    
  } catch (error) {
    console.error('❌ 錯誤:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

resetAllPasswords();

