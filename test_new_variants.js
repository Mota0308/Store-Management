const XLSX = require('xlsx');

// 創建測試新變體的Excel文件
function createTestExcelWithNewVariants() {
  console.log('🧪 創建測試新門市變體的Excel文件...');
  
  // 測試數據 - 使用新的變體格式
  const testData = [
    // 表頭 - 使用新的變體格式
    ['編號', '產品', '尺寸', '觀塘', '灣仔', '荔枝角', '元朗', '元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉', '屯門', '國内倉'],
    // 測試產品數據
    ['VARIANT-001', '測試新變體1', 'S', 5, 8, 12, 15, 3, 6, 9, 11, 20],
    ['VARIANT-002', '測試新變體2', 'M', 10, 15, 20, 25, 8, 12, 16, 18, 30],
    ['VARIANT-003', '測試新變體3', 'L', 7, 11, 14, 18, 5, 9, 13, 15, 25]
  ];

  // 創建工作簿
  const ws = XLSX.utils.aoa_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '新變體測試');

  // 保存文件
  const filename = '測試新門市變體.xlsx';
  XLSX.writeFile(wb, filename);
  
  console.log(`✅ 測試Excel文件已創建: ${filename}`);
  console.log('📋 使用的新變體格式:');
  console.log('  - 元朗觀塘倉 (對應: 元朗倉(觀塘))');
  console.log('  - 元朗灣仔倉 (對應: 元朗倉(灣仔))');
  console.log('  - 元朗荔枝角倉 (對應: 元朗倉(荔枝角))');
  
  console.log('\n📊 測試數據:');
  testData.slice(1).forEach((row, index) => {
    console.log(`  產品 ${index + 1}: ${row[0]} - ${row[1]} (${row[2]})`);
    console.log(`    新變體庫存: 元朗觀塘倉:${row[7]}, 元朗灣仔倉:${row[8]}, 元朗荔枝角倉:${row[9]}`);
  });
  
  return filename;
}

// 創建另一個測試文件使用簡體變體
function createTestExcelWithSimplifiedVariants() {
  console.log('\n🧪 創建測試簡體變體的Excel文件...');
  
  // 測試數據 - 使用簡體變體格式
  const testData = [
    // 表頭 - 使用簡體變體格式
    ['编号', '产品', '尺寸', '观塘', '湾仔', '荔枝角', '元朗', '元朗观塘仓', '元朗湾仔仓', '元朗荔枝角仓', '屯门', '国内仓'],
    // 測試產品數據
    ['SIMPLE-001', '简体变体测试1', 'XS', 2, 4, 6, 8, 1, 3, 5, 7, 12],
    ['SIMPLE-002', '简体变体测试2', 'XL', 12, 18, 24, 30, 10, 15, 20, 22, 35]
  ];

  // 創建工作簿
  const ws = XLSX.utils.aoa_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '簡體變體測試');

  // 保存文件
  const filename = '測試簡體門市變體.xlsx';
  XLSX.writeFile(wb, filename);
  
  console.log(`✅ 簡體測試Excel文件已創建: ${filename}`);
  console.log('📋 使用的簡體變體格式:');
  console.log('  - 元朗观塘仓 (對應: 元朗倉(觀塘))');
  console.log('  - 元朗湾仔仓 (對應: 元朗倉(灣仔))');
  console.log('  - 元朗荔枝角仓 (對應: 元朗倉(荔枝角))');
  
  return filename;
}

// 顯示所有支持的變體格式
function showAllSupportedVariants() {
  console.log('\n📝 所有支持的門市變體格式:');
  console.log('================================');
  
  const variants = {
    '元朗倉(觀塘)': [
      '元朗倉(觀塘)', '元朗仓(观塘)', 
      '元朗倉觀塘', '元朗仓观塘', 
      '元朗觀塘倉', '元朗观塘仓'  // 新增
    ],
    '元朗倉(灣仔)': [
      '元朗倉(灣仔)', '元朗仓(湾仔)', 
      '元朗倉灣仔', '元朗仓湾仔', 
      '元朗灣仔倉', '元朗湾仔仓'  // 新增
    ],
    '元朗倉(荔枝角)': [
      '元朗倉(荔枝角)', '元朗仓(荔枝角)', 
      '元朗倉荔枝角', '元朗仓荔枝角', 
      '元朗荔枝角倉', '元朗荔枝角仓'  // 新增
    ]
  };
  
  Object.entries(variants).forEach(([key, variantList]) => {
    console.log(`\n🏪 ${key}:`);
    variantList.forEach((variant, index) => {
      const isNew = index >= 4; // 新增的變體
      console.log(`  ${index + 1}. ${variant}${isNew ? ' ← 新增' : ''}`);
    });
  });
}

// 主函數
function main() {
  console.log('🔧 Excel門市變體測試工具');
  console.log('============================');
  
  try {
    // 創建測試文件
    const file1 = createTestExcelWithNewVariants();
    const file2 = createTestExcelWithSimplifiedVariants();
    
    // 顯示支持的變體
    showAllSupportedVariants();
    
    console.log('\n📋 測試說明:');
    console.log('1. 使用創建的測試Excel文件進行導入測試');
    console.log('2. 檢查新變體格式是否能正確識別和映射');
    console.log('3. 確認庫存數據正確分配到對應門市');
    console.log('4. 驗證繁簡體變體都能正常工作');
    
    console.log('\n✅ 測試文件準備完成！');
    console.log(`📁 繁體變體測試文件: ${file1}`);
    console.log(`📁 簡體變體測試文件: ${file2}`);
    
  } catch (error) {
    console.error('❌ 創建測試文件失敗:', error);
  }
}

// 運行測試
if (require.main === module) {
  main();
}

module.exports = { 
  createTestExcelWithNewVariants, 
  createTestExcelWithSimplifiedVariants,
  showAllSupportedVariants 
};
