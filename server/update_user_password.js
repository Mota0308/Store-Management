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

async function updatePassword() {
  // 從命令行參數獲取信息
  const args = process.argv.slice(2);
  const useProduction = args.includes('--production') || args.includes('--prod');
  
  // 獲取用戶名和新密碼
  let username = null;
  let newPassword = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' || args[i] === '-u') {
      username = args[i + 1];
    }
    if (args[i] === '--password' || args[i] === '--new-password' || args[i] === '-n') {
      newPassword = args[i + 1];
    }
  }
  
  // 如果沒有提供參數，顯示使用說明
  if (!username || !newPassword) {
    console.log('請提供用戶名和新密碼');
    console.log('\n使用方法:');
    console.log('  本地數據庫:');
    console.log('    node update_user_password.js --username admin --password newpassword123');
    console.log('  生產數據庫:');
    console.log('    node update_user_password.js --production --username admin --password newpassword123');
    console.log('\n或者使用簡寫:');
    console.log('    node update_user_password.js -u admin -n newpassword123');
    console.log('    node update_user_password.js --prod -u admin -n newpassword123');
    console.log('\n參數說明:');
    console.log('  --username, -u      : 用戶名或郵箱');
    console.log('  --password, --new-password, -n : 新密碼');
    console.log('  --production, --prod : 使用生產數據庫');
    process.exit(1);
  }

  // 驗證密碼長度
  if (newPassword.length < 6) {
    console.error('❌ 錯誤: 密碼長度至少需要6個字符');
    process.exit(1);
  }

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
    
    console.log(`\n🔄 正在更新用戶 "${username}" 的密碼...\n`);

    // 查找用戶
    const user = await User.findOne({
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

    console.log(`找到用戶: ${user.username} (${user.email})`);

    // 更新密碼（直接設置明文，pre('save') hook 會自動加密）
    user.password = newPassword;
    await user.save();

    console.log(`\n✅ 密碼更新成功！`);
    console.log(`   用戶名: ${user.username}`);
    console.log(`   郵箱: ${user.email}`);
    console.log(`   新密碼: ${newPassword}`);

  } catch (error) {
    console.error('❌ 發生錯誤:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ 數據庫連接已關閉');
    process.exit(0);
  }
}

// 運行腳本
updatePassword();

