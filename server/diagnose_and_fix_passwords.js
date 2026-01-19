const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './local.env' });

const MONGODB_URI = process.env.RAILWAY_MONGODB_URI || 
  'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

async function diagnoseAndFix() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
    console.log('✅ 已連接到 MongoDB 生產數據庫\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // 測試密碼
    const testPasswords = {
      'admin': 'admin123',
      'testuser': 'test123',
      'manager': 'manager123'
    };

    console.log('🔍 診斷用戶密碼...\n');

    for (const [username, expectedPassword] of Object.entries(testPasswords)) {
      const user = await usersCollection.findOne({ username });
      
      if (!user) {
        console.log(`❌ ${username}: 用戶不存在\n`);
        continue;
      }

      console.log(`用戶: ${user.username}`);
      console.log(`郵箱: ${user.email}`);
      console.log(`密碼哈希前20字符: ${user.password.substring(0, 20)}...`);
      console.log(`密碼哈希長度: ${user.password.length}`);
      
      // 測試密碼驗證
      const isValid = await bcrypt.compare(expectedPassword, user.password);
      console.log(`密碼驗證結果: ${isValid ? '✅ 正確' : '❌ 錯誤'}`);
      
      if (!isValid) {
        console.log(`⚠️  密碼不匹配，將重新設置...`);
        
        // 重新加密密碼
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(expectedPassword, salt);
        
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
        
        // 再次驗證
        const updatedUser = await usersCollection.findOne({ _id: user._id });
        const isValidAfter = await bcrypt.compare(expectedPassword, updatedUser.password);
        console.log(`修復後驗證: ${isValidAfter ? '✅ 成功' : '❌ 失敗'}`);
      }
      
      console.log('');
    }

    console.log('✅ 診斷完成');
    
  } catch (error) {
    console.error('❌ 錯誤:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

diagnoseAndFix();

