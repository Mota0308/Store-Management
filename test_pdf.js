const pdf = require('pdf-parse');
const fs = require('fs');

async function testPdf() {
  try {
    const dataBuffer = fs.readFileSync('../貨存調動紀錄.pdf');
    const data = await pdf(dataBuffer);
    console.log('PDF文本內容:');
    console.log(data.text);
    
    // 查找 WS-409PBK/LB
    const lines = data.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    console.log('\n查找包含 WS-409 的行:');
    lines.forEach((line, i) => {
      if (line.includes('WS-409')) {
        console.log(`行 ${i}: ${line}`);
      }
    });
  } catch (error) {
    console.error('錯誤:', error);
  }
}

testPdf();
