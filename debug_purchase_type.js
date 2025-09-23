// 调试购买类型信息的提取
const fs = require('fs');
const pdf = require('pdf-parse');

async function debugPurchaseType() {
  try {
    console.log('🔍 调试购买类型信息提取...\n');
    
    const pdfPath = '1.pdf';
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    const lines = data.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    console.log('🔎 查找包含"購買類型"的行:');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('購買類型') || line.includes('类型') || line.includes('褲子') || line.includes('上衣')) {
        console.log(`第${i+1}行: ${line}`);
        
        // 显示前后几行的上下文
        console.log('  上下文:');
        for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+2); j++) {
          const prefix = j === i ? '>>> ' : '    ';
          console.log(`${prefix}第${j+1}行: ${lines[j]}`);
        }
        console.log('');
      }
    }
    
    console.log('\n🔎 查找可能的购买类型关键词:');
    const purchaseTypeKeywords = ['上衣', '褲子', '套裝', '夾克', '連身', '泳衣', '泳鏡', '配件', '短褲', '長褲'];
    
    for (const keyword of purchaseTypeKeywords) {
      console.log(`\n查找 "${keyword}":`);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(keyword)) {
          console.log(`  第${i+1}行: ${line}`);
        }
      }
    }
    
    console.log('\n🔎 详细分析WS-606BK和WS-606PK周围的行:');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('WS-606BK') || line.includes('WS-606PK')) {
        console.log(`\n找到产品: 第${i+1}行: ${line}`);
        
        // 显示前后5行
        for (let j = Math.max(0, i-3); j <= Math.min(lines.length-1, i+5); j++) {
          const prefix = j === i ? '>>> ' : '    ';
          console.log(`${prefix}第${j+1}行: ${lines[j]}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  }
}

// 运行调试
debugPurchaseType(); 