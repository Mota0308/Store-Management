const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './local.env' });

// 連接到數據庫
const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri, {
      dbName: uri.includes('Storage_Local') ? 'Storage_Local' : 'Storage'
    });
    console.log('✅ MongoDB 連接成功');
  } catch (error) {
    console.error('❌ MongoDB 連接失敗:', error);
    process.exit(1);
  }
};

// User 模型
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    minlength: 3,
    maxlength: 30,
    index: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, '請輸入有效的電子郵件地址']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  }
}, { timestamps: true });

// 在保存前加密密碼
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', UserSchema, 'users');

// 要更新的用戶列表（可以自定義）
const usersToUpdate = [
  {
    username: 'admin',
    newPassword: 'admin123'
  },
  {
    username: 'testuser',
    newPassword: 'test123'
  },
  {
    username: 'manager',
    newPassword: 'manager123'
  }
];

async function updateAllPasswords() {
  const args = process.argv.slice(2);
  const useProduction = args.includes('--production') || args.includes('--prod');
  
  let mongoURI;
  if (useProduction) {
    mongoURI = process.env.RAILWAY_MONGODB_URI || 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';
    console.log('📡 連接到生產數據庫 (Railway)...');
  } else {
    mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Storage_Local';
    console.log('🏠 連接到本地數據庫...');
  }

  try {
    await connectDB(mongoURI);
    
    console.log('\n🔄 開始批量更新用戶密碼...\n');
    
    const results = {
      updated: [],
      notFound: [],
      errors: []
    };

    for (const userData of usersToUpdate) {
      try {
        const user = await User.findOne({
          $or: [
            { username: userData.username },
            { email: userData.username }
          ]
        });

        if (!user) {
          console.log(`⏭️  跳過: ${userData.username} (用戶不存在)`);
          results.notFound.push({
            username: userData.username,
            reason: '用戶不存在'
          });
          continue;
        }

        // 更新密碼
        user.password = userData.newPassword;
        await user.save();

        console.log(`✅ 更新成功: ${user.username} (${user.email})`);
        results.updated.push({
          username: user.username,
          email: user.email,
          newPassword: userData.newPassword
        });
      } catch (error) {
        console.error(`❌ 更新失敗: ${userData.username}`, error.message);
        results.errors.push({
          username: userData.username,
          error: error.message
        });
      }
    }

    // 顯示結果摘要
    console.log('\n📊 更新結果摘要:');
    console.log(`✅ 成功更新: ${results.updated.length} 個用戶`);
    console.log(`⏭️  未找到: ${results.notFound.length} 個用戶`);
    console.log(`❌ 錯誤: ${results.errors.length} 個用戶`);

    if (results.updated.length > 0) {
      console.log('\n📝 已更新的賬號:');
      results.updated.forEach(user => {
        console.log(`   用戶名: ${user.username}`);
        console.log(`   郵箱: ${user.email}`);
        console.log(`   新密碼: ${user.newPassword}`);
        console.log('');
      });
    }

    if (results.notFound.length > 0) {
      console.log('\n⏭️  未找到的用戶:');
      results.notFound.forEach(user => {
        console.log(`   ${user.username}: ${user.reason}`);
      });
    }

    if (results.errors.length > 0) {
      console.log('\n❌ 錯誤:');
      results.errors.forEach(user => {
        console.log(`   ${user.username}: ${user.error}`);
      });
    }

  } catch (error) {
    console.error('❌ 發生錯誤:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

// 運行腳本
updateAllPasswords();

