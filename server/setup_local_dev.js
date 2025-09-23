// 本地開發環境設置腳本
const fs = require('fs');
const path = require('path');

function setupLocalDevelopment() {
  console.log('🛠️ 設置本地開發環境...\n');
  
  // 1. 創建本地環境變量文件
  console.log('📝 創建環境配置...');
  
  const envContent = `# 本地開發環境配置
NODE_ENV=development
PORT=4001

# 本地MongoDB數據庫連接
MONGODB_URI=mongodb://localhost:27017/Storage_Local

# Railway生產數據庫（僅用於遷移）
RAILWAY_MONGODB_URI=mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0
`;
  
  fs.writeFileSync('.env.local', envContent);
  console.log('✅ 已創建 .env.local 文件');
  
  // 2. 更新package.json腳本
  console.log('\n📦 檢查package.json腳本...');
  
  const packageJsonPath = 'package.json';
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // 添加本地開發腳本
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    
    packageJson.scripts['dev:local'] = 'cross-env NODE_ENV=development MONGODB_URI=mongodb://localhost:27017/Storage_Local ts-node-dev --respawn --transpile-only src/index.ts';
    packageJson.scripts['migrate'] = 'node migrate_database.js';
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ 已更新package.json腳本');
  }
  
  // 3. 創建本地開發說明
  console.log('\n📚 創建開發說明...');
  
  const readmeContent = `# 本地開發環境設置

## 前置條件

1. **安裝MongoDB**
   - 下載：https://www.mongodb.com/try/download/community
   - Windows：安裝後運行 \`net start mongodb\`
   - 或使用Docker：\`docker run -d -p 27017:27017 --name mongodb mongo\`

2. **安裝依賴**
   \`\`\`bash
   npm install
   \`\`\`

## 數據庫設置

1. **遷移數據**
   \`\`\`bash
   node migrate_database.js
   \`\`\`

2. **啟動本地服務器**
   \`\`\`bash
   npm run dev:local
   \`\`\`

## 測試功能

1. **測試門市對調**
   \`\`\`bash
   node test_transfer_complete.js
   \`\`\`

## 數據庫連接

- **本地**: \`mongodb://localhost:27017/Storage_Local\`
- **生產**: Railway MongoDB (自動)

## 注意事項

- 本地開發使用獨立的數據庫，不會影響生產環境
- 數據遷移會覆蓋本地數據庫的所有內容
- 測試完成後可以重新遷移以重置數據
`;
  
  fs.writeFileSync('README_LOCAL_DEV.md', readmeContent);
  console.log('✅ 已創建 README_LOCAL_DEV.md');
  
  // 4. 檢查必要的依賴
  console.log('\n🔍 檢查依賴包...');
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['mongodb', 'cross-env'];
  const missingDeps = [];
  
  requiredDeps.forEach(dep => {
    if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) {
      missingDeps.push(dep);
    }
  });
  
  if (missingDeps.length > 0) {
    console.log('⚠️ 需要安裝額外依賴:');
    missingDeps.forEach(dep => console.log(`  - ${dep}`));
    console.log('\n運行: npm install ' + missingDeps.join(' '));
  } else {
    console.log('✅ 所有必要依賴已安裝');
  }
  
  console.log('\n🎉 本地開發環境設置完成！');
  console.log('\n📋 下一步操作:');
  console.log('1. 確保MongoDB服務運行');
  console.log('2. 運行: node migrate_database.js');
  console.log('3. 運行: npm run dev:local');
  console.log('4. 測試門市對調功能');
}

// 執行設置
if (require.main === module) {
  setupLocalDevelopment();
}

module.exports = { setupLocalDevelopment }; 