const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './local.env' });

const MONGODB_URI = process.env.RAILWAY_MONGODB_URI || 
  'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

async function updateUserDirectly() {
  // 從命令行參數獲取信息
  const args = process.argv.slice(2);
  
  let username = null;
  let newPassword = null;
  let newEmail = null;
  let listUsers = false;
  
  // 解析命令行參數
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' || args[i] === '-u') {
      username = args[i + 1];
    }
    if (args[i] === '--password' || args[i] === '--new-password' || args[i] === '-p') {
      newPassword = args[i + 1];
    }
    if (args[i] === '--email' || args[i] === '-e') {
      newEmail = args[i + 1];
    }
    if (args[i] === '--list' || args[i] === '-l') {
      listUsers = true;
    }
  }

  try {
    // 連接到數據庫
    await mongoose.connect(MONGODB_URI, {
      dbName: 'Storage'
    });
    console.log('✅ 已連接到 MongoDB 生產數據庫\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // 如果只是列出用戶
    if (listUsers) {
      console.log('📋 所有用戶列表:\n');
      const users = await usersCollection.find({}).toArray();
      
      if (users.length === 0) {
        console.log('  沒有找到任何用戶');
      } else {
        users.forEach((user, index) => {
          console.log(`${index + 1}. 用戶名: ${user.username}`);
          console.log(`   郵箱: ${user.email}`);
          console.log(`   創建時間: ${user.createdAt || '未知'}`);
          console.log(`   更新時間: ${user.updatedAt || '未知'}`);
          console.log('');
        });
      }
      await mongoose.connection.close();
      process.exit(0);
    }

    // 如果沒有提供用戶名，顯示使用說明
    if (!username) {
      console.log('請提供用戶名');
      console.log('\n使用方法:');
      console.log('  更新密碼:');
      console.log('    node direct_update_mongodb.js -u admin -p newpassword123');
      console.log('  更新郵箱:');
      console.log('    node direct_update_mongodb.js -u admin -e newemail@example.com');
      console.log('  同時更新密碼和郵箱:');
      console.log('    node direct_update_mongodb.js -u admin -p newpassword123 -e newemail@example.com');
      console.log('  列出所有用戶:');
      console.log('    node direct_update_mongodb.js --list');
      console.log('\n參數說明:');
      console.log('  --username, -u    : 用戶名或郵箱');
      console.log('  --password, -p    : 新密碼（至少6個字符）');
      console.log('  --email, -e       : 新郵箱');
      console.log('  --list, -l        : 列出所有用戶');
      await mongoose.connection.close();
      process.exit(1);
    }

    // 查找用戶
    const user = await usersCollection.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    });

    if (!user) {
      console.error(`❌ 錯誤: 找不到用戶 "${username}"`);
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`找到用戶: ${user.username} (${user.email})\n`);

    // 準備更新數據
    const updateData = {
      updatedAt: new Date()
    };

    // 更新密碼
    if (newPassword) {
      if (newPassword.length < 6) {
        console.error('❌ 錯誤: 密碼長度至少需要6個字符');
        await mongoose.connection.close();
        process.exit(1);
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      updateData.password = hashedPassword;
      console.log('✅ 密碼已加密準備更新');
    }

    // 更新郵箱
    if (newEmail) {
      // 驗證郵箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        console.error('❌ 錯誤: 無效的郵箱格式');
        await mongoose.connection.close();
        process.exit(1);
      }

      // 檢查郵箱是否已被使用
      const existingUser = await usersCollection.findOne({ 
        email: newEmail.toLowerCase(),
        _id: { $ne: user._id }
      });

      if (existingUser) {
        console.error(`❌ 錯誤: 郵箱 "${newEmail}" 已被其他用戶使用`);
        await mongoose.connection.close();
        process.exit(1);
      }

      updateData.email = newEmail.toLowerCase();
      console.log('✅ 郵箱已準備更新');
    }

    // 如果沒有要更新的內容
    if (!newPassword && !newEmail) {
      console.log('❌ 錯誤: 請提供要更新的內容（密碼或郵箱）');
      await mongoose.connection.close();
      process.exit(1);
    }

    // 執行更新
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { $set: updateData }
    );

    if (result.modifiedCount > 0) {
      console.log('\n✅ 更新成功！\n');
      
      // 獲取更新後的用戶信息
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      console.log('更新後的用戶信息:');
      console.log(`  用戶名: ${updatedUser.username}`);
      console.log(`  郵箱: ${updatedUser.email}`);
      if (newPassword) {
        console.log(`  新密碼: ${newPassword}`);
        console.log(`  密碼哈希: ${updatedUser.password.substring(0, 20)}...`);
      }
      console.log(`  更新時間: ${updatedUser.updatedAt}`);
    } else {
      console.log('ℹ️  用戶信息未更改');
    }

  } catch (error) {
    console.error('❌ 發生錯誤:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

// 運行腳本
updateUserDirectly();

