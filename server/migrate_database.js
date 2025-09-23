// 數據庫遷移腳本 - 從Railway複製數據到本地MongoDB
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// 數據庫連接配置
const RAILWAY_URI = 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';
const LOCAL_URI = 'mongodb://localhost:27017/Storage_Local';

async function migrateDatabase() {
  let railwayClient, localClient;
  
  try {
    console.log('🚀 開始數據庫遷移...\n');
    
    // 1. 連接到Railway數據庫
    console.log('📡 連接到Railway數據庫...');
    railwayClient = new MongoClient(RAILWAY_URI);
    await railwayClient.connect();
    const railwayDb = railwayClient.db('Storage');
    console.log('✅ Railway數據庫連接成功');
    
    // 2. 連接到本地數據庫
    console.log('🏠 連接到本地數據庫...');
    localClient = new MongoClient(LOCAL_URI);
    await localClient.connect();
    const localDb = localClient.db('Storage_Local');
    console.log('✅ 本地數據庫連接成功');
    
    // 3. 獲取Railway數據庫的集合列表
    console.log('\n📋 獲取數據庫結構...');
    const collections = await railwayDb.listCollections().toArray();
    console.log('找到的集合:');
    collections.forEach((col, idx) => {
      console.log(`  ${idx + 1}. ${col.name}`);
    });
    
    // 4. 遷移每個集合的數據
    console.log('\n🔄 開始數據遷移...');
    
    const migrationResults = {};
    
    for (const collection of collections) {
      const collectionName = collection.name;
      console.log(`\n📦 遷移集合: ${collectionName}`);
      
      try {
        // 獲取Railway集合的所有數據
        const railwayCollection = railwayDb.collection(collectionName);
        const documents = await railwayCollection.find({}).toArray();
        
        console.log(`  - 找到 ${documents.length} 個文檔`);
        
        if (documents.length > 0) {
          // 清空本地集合（如果存在）
          const localCollection = localDb.collection(collectionName);
          await localCollection.deleteMany({});
          console.log(`  - 已清空本地集合`);
          
          // 插入數據到本地集合
          const result = await localCollection.insertMany(documents);
          console.log(`  - ✅ 成功插入 ${result.insertedCount} 個文檔`);
          
          migrationResults[collectionName] = {
            source: documents.length,
            migrated: result.insertedCount,
            success: true
          };
        } else {
          console.log(`  - ⚠️ 集合為空，跳過`);
          migrationResults[collectionName] = {
            source: 0,
            migrated: 0,
            success: true
          };
        }
        
      } catch (error) {
        console.log(`  - ❌ 遷移失敗: ${error.message}`);
        migrationResults[collectionName] = {
          source: 0,
          migrated: 0,
          success: false,
          error: error.message
        };
      }
    }
    
    // 5. 驗證遷移結果
    console.log('\n🔍 驗證遷移結果...');
    
    for (const collectionName of Object.keys(migrationResults)) {
      const result = migrationResults[collectionName];
      if (result.success && result.migrated > 0) {
        const localCollection = localDb.collection(collectionName);
        const count = await localCollection.countDocuments();
        console.log(`✅ ${collectionName}: ${count} 個文檔`);
      }
    }
    
    // 6. 生成遷移報告
    console.log('\n📊 遷移報告:');
    console.log('================================');
    
    let totalSource = 0;
    let totalMigrated = 0;
    let successfulCollections = 0;
    
    Object.entries(migrationResults).forEach(([name, result]) => {
      totalSource += result.source;
      totalMigrated += result.migrated;
      if (result.success) successfulCollections++;
      
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${name}: ${result.source} → ${result.migrated}`);
    });
    
    console.log('================================');
    console.log(`📈 總計: ${totalSource} → ${totalMigrated} 個文檔`);
    console.log(`📊 成功率: ${successfulCollections}/${collections.length} 個集合`);
    
    // 7. 保存遷移報告
    const report = {
      timestamp: new Date().toISOString(),
      source: 'Railway MongoDB',
      destination: 'Local MongoDB',
      results: migrationResults,
      summary: {
        totalCollections: collections.length,
        successfulCollections,
        totalDocuments: totalMigrated
      }
    };
    
    fs.writeFileSync('migration_report.json', JSON.stringify(report, null, 2));
    console.log('\n💾 遷移報告已保存到: migration_report.json');
    
    console.log('\n🎉 數據庫遷移完成！');
    console.log('💡 現在您可以使用本地數據庫進行測試了');
    
  } catch (error) {
    console.error('❌ 數據庫遷移失敗:', error);
  } finally {
    // 關閉數據庫連接
    if (railwayClient) {
      await railwayClient.close();
      console.log('🔌 Railway數據庫連接已關閉');
    }
    if (localClient) {
      await localClient.close();
      console.log('🔌 本地數據庫連接已關閉');
    }
  }
}

// 檢查MongoDB是否運行
async function checkMongoDBStatus() {
  try {
    console.log('🔍 檢查本地MongoDB狀態...');
    
    const client = new MongoClient(LOCAL_URI);
    await client.connect();
    await client.db('admin').admin().ping();
    await client.close();
    
    console.log('✅ 本地MongoDB運行正常');
    return true;
  } catch (error) {
    console.log('❌ 本地MongoDB未運行或連接失敗');
    console.log('💡 請確保MongoDB已安裝並運行');
    console.log('   Windows: 運行 "net start mongodb" 或啟動MongoDB服務');
    console.log('   或安裝MongoDB Community Server: https://www.mongodb.com/try/download/community');
    return false;
  }
}

// 主函數
async function main() {
  console.log('🎯 MongoDB數據庫遷移工具\n');
  
  // 檢查本地MongoDB
  const mongoReady = await checkMongoDBStatus();
  if (!mongoReady) {
    console.log('\n❌ 請先啟動本地MongoDB服務');
    return;
  }
  
  // 確認遷移操作
  console.log('⚠️ 此操作將：');
  console.log('1. 清空本地數據庫的所有數據');
  console.log('2. 從Railway複製所有數據到本地');
  console.log('3. 用於本地開發和測試\n');
  
  // 開始遷移
  await migrateDatabase();
}

// 如果直接運行此腳本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { migrateDatabase, checkMongoDBStatus }; 