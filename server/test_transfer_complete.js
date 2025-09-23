// 完整的門市對調功能測試腳本
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4001/api';

// 等待服務器啟動
async function waitForServer(maxAttempts = 20) {
  console.log('🔄 等待服務器啟動...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`${BASE_URL}/locations`, { timeout: 3000 });
      console.log('✅ 服務器已啟動');
      return true;
    } catch (error) {
      if (i === maxAttempts - 1) {
        console.log('❌ 服務器啟動超時');
        console.log('💡 請確保運行: npm run dev 或 npm run dev:local');
        return false;
      }
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return false;
}

// 獲取門市列表
async function getLocations() {
  try {
    const response = await axios.get(`${BASE_URL}/locations`);
    console.log('\n📍 可用門市:');
    response.data.forEach((location, idx) => {
      console.log(`  ${idx + 1}. ${location.name} (ID: ${location._id})`);
    });
    return response.data;
  } catch (error) {
    console.error('❌ 獲取門市列表失敗:', error.message);
    return [];
  }
}

// 測試門市對調功能
async function testTransferFunction() {
  try {
    console.log('\n🧪 測試門市對調功能...');
    
    const locations = await getLocations();
    if (locations.length < 2) {
      console.log('❌ 需要至少2個門市才能測試門市對調');
      return false;
    }
    
    const fromLocationId = locations[0]._id; // 第一個門市作為來源
    const toLocationId = locations[1]._id;   // 第二個門市作為目標
    
    console.log(`\n📋 測試設置:`);
    console.log(`- 來源門市: ${locations[0].name}`);
    console.log(`- 目標門市: ${locations[1].name}`);
    
    // 創建FormData
    const form = new FormData();
    form.append('fromLocationId', fromLocationId);
    form.append('toLocationId', toLocationId);
    
    // 添加測試PDF文件
    const pdfPath = path.resolve(__dirname, '..', '貨存調動紀錄.pdf');
    console.log('PDF文件路徑:', pdfPath);
    
    if (fs.existsSync(pdfPath)) {
      const pdfStream = fs.createReadStream(pdfPath);
      form.append('files', pdfStream, {
        filename: '貨存調動紀錄.pdf',
        contentType: 'application/pdf'
      });
      console.log('📄 已添加貨存調動PDF文件');
    } else {
      console.log('⚠️ 未找到貨存調動PDF文件');
      console.log('   預期位置:', pdfPath);
      return false;
    }
    
    console.log('\n🚀 發送門市對調請求...');
    
    const response = await axios.post(`${BASE_URL}/import/transfer`, form, {
      headers: {
        ...form.getHeaders(),
        'Accept': 'application/json'
      },
      timeout: 60000, // 60秒超時
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('\n✅ 門市對調請求成功！');
    console.log('\n📊 處理結果詳情:');
    console.log('================================');
    console.log(`📁 處理文件數: ${response.data.files}`);
    console.log(`📦 處理商品數: ${response.data.processed}`);
    console.log(`🎯 匹配商品數: ${response.data.matched}`);
    console.log(`🔄 更新記錄數: ${response.data.updated}`);
    console.log(`❓ 未找到商品: ${response.data.notFound?.length || 0} 個`);
    
    // 顯示解析出的商品信息
    if (response.data.parsed && response.data.parsed.length > 0) {
      console.log('\n📋 解析出的商品 (前10個):');
      response.data.parsed.slice(0, 10).forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.code || item.name} - 數量: ${item.qty}`);
      });
    }
    
    // 顯示未找到的商品
    if (response.data.notFound && response.data.notFound.length > 0) {
      console.log('\n⚠️ 未找到的商品 (前10個):');
      response.data.notFound.slice(0, 10).forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item}`);
      });
      
      if (response.data.notFound.length > 10) {
        console.log(`  ... 還有 ${response.data.notFound.length - 10} 個未找到的商品`);
      }
    }
    
    // 顯示錯誤信息
    if (response.data.errors && response.data.errors.length > 0) {
      console.log('\n❌ 處理錯誤:');
      response.data.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
    }
    
    // 計算成功率
    const successRate = response.data.processed > 0 ? 
      (response.data.matched / response.data.processed * 100).toFixed(1) : 0;
    
    console.log('\n📈 處理統計:');
    console.log(`- 成功率: ${successRate}%`);
    console.log(`- 處理效率: ${response.data.matched}/${response.data.processed}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ 門市對調測試失敗:');
    
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        console.error('響應數據:', error.response.data);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('連接被拒絕 - 請確保服務器正在運行');
    } else {
      console.error('錯誤詳情:', error.message);
    }
    
    return false;
  }
}

// 測試其他功能（確保不受影響）
async function testOtherFunctions() {
  try {
    console.log('\n🔍 測試其他功能是否正常...');
    
    // 測試產品列表
    const productsResponse = await axios.get(`${BASE_URL}/products`);
    console.log(`✅ 產品列表: ${productsResponse.data.length} 個產品`);
    
    // 測試門市列表
    const locationsResponse = await axios.get(`${BASE_URL}/locations`);
    console.log(`✅ 門市列表: ${locationsResponse.data.length} 個門市`);
    
    // 測試產品類型
    const typesResponse = await axios.get(`${BASE_URL}/product-types`);
    console.log(`✅ 產品類型: ${typesResponse.data.length} 個類型`);
    
    return true;
    
  } catch (error) {
    console.error('❌ 其他功能測試失敗:', error.message);
    return false;
  }
}

// 主測試函數
async function runCompleteTest() {
  console.log('🎯 門市對調功能完整測試');
  console.log('================================================\n');
  
  // 1. 等待服務器啟動
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.log('\n❌ 無法連接到服務器');
    console.log('💡 請確保：');
    console.log('   1. MongoDB服務正在運行');
    console.log('   2. 後端服務器已啟動 (npm run dev)');
    return;
  }
  
  // 2. 測試其他功能
  console.log('\n================================================');
  const otherFunctionsOK = await testOtherFunctions();
  
  // 3. 測試門市對調功能
  console.log('\n================================================');
  const transferSuccess = await testTransferFunction();
  
  // 4. 總結測試結果
  console.log('\n================================================');
  console.log('🎯 測試結果總結:');
  console.log(`- 其他功能狀態: ${otherFunctionsOK ? '✅ 正常' : '❌ 異常'}`);
  console.log(`- 門市對調功能: ${transferSuccess ? '✅ 成功' : '❌ 失敗'}`);
  
  if (transferSuccess && otherFunctionsOK) {
    console.log('\n🎉 所有測試通過！門市對調功能已準備就緒！');
    console.log('💡 您現在可以：');
    console.log('   1. 使用前端界面測試門市對調');
    console.log('   2. 上傳貨存調動PDF文件');
    console.log('   3. 驗證庫存轉移結果');
  } else {
    console.log('\n⚠️ 部分測試失敗，請檢查：');
    if (!otherFunctionsOK) {
      console.log('   - 數據庫連接和基本功能');
    }
    if (!transferSuccess) {
      console.log('   - 門市對調API實現');
    }
  }
}

// 執行測試
if (require.main === module) {
  runCompleteTest().catch(console.error);
}

module.exports = { testTransferFunction, testOtherFunctions }; 