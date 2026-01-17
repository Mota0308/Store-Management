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

// User 模型（與 server/src/models/User.ts 保持一致）
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

// 在保存前加密密碼（與 User.ts 模型保持一致）
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

// 比較密碼的方法
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema, 'users');

// 測試用戶數據
const testUsers = [
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123'
  },
  {
    username: 'testuser',
    email: 'test@example.com',
    password: 'test123'
  },
  {
    username: 'manager',
    email: 'manager@example.com',
    password: 'manager123'
  }
];

async function createTestUsers() {
  // 選擇數據庫（本地或生產）
  const args = process.argv.slice(2);
  const useProduction = args.includes('--production') || args.includes('-p');
  
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
    
    console.log('\n🔄 開始創建測試用戶...\n');
    
    const results = {
      created: [],
      skipped: [],
      errors: []
    };

    for (const userData of testUsers) {
      try {
        // 檢查用戶是否已存在
        const existingUser = await User.findOne({
          $or: [
            { username: userData.username },
            { email: userData.email }
          ]
        });

        // 如果用戶已存在，先刪除（以便重新創建）
        if (existingUser) {
          await User.deleteOne({ _id: existingUser._id });
          console.log(`🗑️  刪除舊用戶: ${userData.username}`);
        }

        // 創建用戶（使用 User 模型，會自動通過 pre('save') hook 加密密碼）
        const user = new User({
          username: userData.username,
          email: userData.email,
          password: userData.password  // 直接使用明文，讓 pre('save') hook 處理加密
        });

        await user.save();
        console.log(`✅ 創建成功: ${userData.username} (${userData.email})`);
        results.created.push({
          username: userData.username,
          email: userData.email,
          password: userData.password
        });
      } catch (error) {
        console.error(`❌ 創建失敗: ${userData.username}`, error.message);
        results.errors.push({
          username: userData.username,
          error: error.message
        });
      }
    }

    // 顯示結果摘要
    console.log('\n📊 創建結果摘要:');
    console.log(`✅ 成功創建: ${results.created.length} 個用戶`);
    console.log(`⏭️  跳過: ${results.skipped.length} 個用戶`);
    console.log(`❌ 錯誤: ${results.errors.length} 個用戶`);

    if (results.created.length > 0) {
      console.log('\n📝 創建的測試賬號:');
      results.created.forEach(user => {
        console.log(`   用戶名: ${user.username}`);
        console.log(`   郵箱: ${user.email}`);
        console.log(`   密碼: ${user.password}`);
        console.log('');
      });
    }

    if (results.skipped.length > 0) {
      console.log('\n⏭️  跳過的用戶:');
      results.skipped.forEach(user => {
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
createTestUsers();

