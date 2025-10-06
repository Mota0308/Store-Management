const XLSX = require('xlsx');

// 創建測試Excel文件
function createTestExcel() {
  // 測試數據 - 包含所有9個門市列
  const testData = [
    // 表頭
    ['編號', '產品', '尺寸', '觀塘', '灣仔', '荔枝角', '元朗', '元朗倉(觀塘)', '元朗倉(灣仔)', '元朗倉(荔枝角)', '屯門', '國内倉'],
    // 測試產品數據
    ['TEST-001', '測試產品1', 'M', 10, 15, 20, 25, 5, 8, 12, 18, 30],
    ['TEST-002', '測試產品2', 'L', 8, 12, 16, 20, 3, 6, 9, 14, 25],
    ['TEST-003', '測試產品3', 'XL', 5, 10, 15, 18, 2, 4, 7, 11, 22]
  ];

  // 創建工作簿
  const ws = XLSX.utils.aoa_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '庫存測試');

  // 保存文件
  const filename = '測試Excel導入_9門市.xlsx';
  XLSX.writeFile(wb, filename);
  
  console.log(`✅ 測試Excel文件已創建: ${filename}`);
  console.log('📋 文件包含以下列:');
  testData[0].forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
  
  console.log('\n📊 測試數據:');
  testData.slice(1).forEach((row, index) => {
    console.log(`  產品 ${index + 1}: ${row[0]} - ${row[1]} (${row[2]})`);
    console.log(`    庫存分佈: 觀塘:${row[3]}, 灣仔:${row[4]}, 荔枝角:${row[5]}, 元朗:${row[6]}`);
    console.log(`              元朗倉(觀塘):${row[7]}, 元朗倉(灣仔):${row[8]}, 元朗倉(荔枝角):${row[9]}, 屯門:${row[10]}, 國内倉:${row[11]}`);
  });
  
  return filename;
}

// 驗證導出Excel格式
function verifyExportFormat() {
  console.log('\n🔍 驗證導出Excel格式:');
  console.log('預期的表頭順序應該是:');
  const expectedHeaders = ['編號', '產品', '尺寸', '觀塘', '灣仔', '荔枝角', '元朗', '元朗倉(觀塘)', '元朗倉(灣仔)', '元朗倉(荔枝角)', '屯門', '國内倉'];
  expectedHeaders.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
}

// 主函數
function main() {
  console.log('🧪 Excel導入/導出功能測試');
  console.log('================================');
  
  try {
    const filename = createTestExcel();
    verifyExportFormat();
    
    console.log('\n📝 測試說明:');
    console.log('1. 使用創建的測試Excel文件進行導入測試');
    console.log('2. 檢查導入後各門市的庫存數量是否正確');
    console.log('3. 使用導出功能驗證所有9個門市列都包含在內');
    console.log('4. 確認門市順序符合預期');
    
    console.log('\n✅ 測試文件準備完成！');
    
  } catch (error) {
    console.error('❌ 創建測試文件失敗:', error);
  }
}

// 運行測試
if (require.main === module) {
  main();
}

module.exports = { createTestExcel, verifyExportFormat };
