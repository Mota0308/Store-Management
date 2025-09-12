const pdf = require('pdf-parse');
const fs = require('fs');

async function analyzePDFText() {
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
    
    console.log('\n=== 查找包含"尺寸"的行 ===');
    const lines = data.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    
    lines.forEach((line, index) => {
      if (line.includes('尺寸') || line.includes('WS-')) {
        console.log(`行 ${index + 1}: "${line}"`);
        
        // 測試各種尺寸匹配模式
        const patterns = [
          /尺寸[：:]\s*([^，,\s\n]+)/,
          /- 尺寸[：:]\s*([^，,\s\n]+)/,
          /尺寸[：:]\s*(\d+)/,
          /- 尺寸[：:]\s*(\d+)/,
          /尺寸[：:]\s*([^，,\s\n\r]+)/,
          /- 尺寸[：:]\s*([^，,\s\n\r]+)/
        ];
        
        patterns.forEach((pattern, i) => {
          const match = line.match(pattern);
          if (match) {
            console.log(`  模式 ${i + 1} 匹配: "${match[1]}"`);
          }
        });
      }
    });
    
    console.log('\n=== 查找包含"購買類型"的行 ===');
    lines.forEach((line, index) => {
      if (line.includes('購買類型')) {
        console.log(`行 ${index + 1}: "${line}"`);
        
        // 測試各種購買類型匹配模式
        const patterns = [
          /購買類型[：:]\s*([^，,\s\n]+)/,
          /- 購買類型[：:]\s*([^，,\s\n]+)/,
          /購買類型[：:]\s*(上衣|褲子|套裝)/,
          /- 購買類型[：:]\s*(上衣|褲子|套裝)/
        ];
        
        patterns.forEach((pattern, i) => {
          const match = line.match(pattern);
          if (match) {
            console.log(`  模式 ${i + 1} 匹配: "${match[1]}"`);
          }
        });
      }
    });
    
    console.log('\n=== 查找WS-商品代碼及其後續行 ===');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/(WS-\w+)/)) {
        console.log(`\n商品代碼行 ${i + 1}: "${line}"`);
        
        // 檢查後續5行
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const nextLine = lines[j];
          console.log(`  後續行 ${j + 1}: "${nextLine}"`);
          
          // 檢查是否包含尺寸或購買類型
          if (nextLine.includes('尺寸') || nextLine.includes('購買類型')) {
            console.log(`    *** 包含尺寸/購買類型信息 ***`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('錯誤:', error);
  }
}

analyzePDFText();
