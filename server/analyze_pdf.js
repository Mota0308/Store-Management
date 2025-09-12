const pdf = require('pdf-parse');
const fs = require('fs');

async function analyzePDF() {
  try {
    // 讀取PDF文件
    const pdfPath = '發票(訂單號碼_3095811,3095810,3095776,3095773).pdf';
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('=== PDF文件分析 ===');
    console.log('文件大小:', dataBuffer.length, 'bytes');
    
    // 解析PDF
    const data = await pdf(dataBuffer);
    console.log('PDF頁數:', data.numpages);
    console.log('PDF文本長度:', data.text.length);
    
    console.log('\n=== PDF文本內容 ===');
    console.log(data.text);
    
    console.log('\n=== 按行分析 ===');
    const lines = data.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      console.log(`行 ${index + 1}: ${line}`);
    });
    
    console.log('\n=== 查找商品代碼 ===');
    const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}(?:[A-Z]+)?(?:\/[A-Z]+)?)|(?:\b\d{8,14}\b)/;
    const foundCodes = [];
    
    lines.forEach((line, index) => {
      const matches = line.match(codePattern);
      if (matches) {
        foundCodes.push({
          line: index + 1,
          content: line,
          codes: matches
        });
      }
    });
    
    console.log('找到的商品代碼:');
    foundCodes.forEach(item => {
      console.log(`行 ${item.line}: ${item.content}`);
      console.log(`  代碼: ${item.codes.join(', ')}`);
    });
    
    console.log('\n=== 查找數量 ===');
    const qtyPattern = /\b(\d{1,3})\b/;
    const foundQuantities = [];
    
    lines.forEach((line, index) => {
      const matches = line.match(qtyPattern);
      if (matches) {
        foundQuantities.push({
          line: index + 1,
          content: line,
          quantities: matches
        });
      }
    });
    
    console.log('找到的數量:');
    foundQuantities.forEach(item => {
      console.log(`行 ${item.line}: ${item.content}`);
      console.log(`  數量: ${item.quantities.join(', ')}`);
    });
    
  } catch (error) {
    console.error('錯誤:', error);
  }
}

analyzePDF();
