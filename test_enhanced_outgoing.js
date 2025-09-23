// 测试增强版出货解析逻辑
const fs = require('fs');
const pdf = require('pdf-parse');

async function testEnhancedOutgoingLogic() {
  try {
    console.log('🧪 测试增强版出货解析逻辑...\n');
    
    const pdfPath = '1.pdf';
    
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF文件不存在:', pdfPath);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    console.log('📄 使用增强版逻辑解析PDF...');
    
    const text = data.text;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const processedCodes = new Set(); // 避免重复处理
    const extractedItems = [];
    
    console.log('调试: PDF解析开始，总行数:', lines.length);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查是否是产品表格行（包含产品代码、数量、价格的行）
      // 匹配格式：产品代码 + 数量 + 价格
      const tableRowMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\s+(\d+)\s+HK\$[\d,]+\.\d{2}/);
      if (tableRowMatch) {
        const code = tableRowMatch[1];
        const qty = parseInt(tableRowMatch[2], 10);
        
        if (!processedCodes.has(code) && qty > 0 && qty <= 20) {
          extractedItems.push({
            code,
            qty,
            originalLine: line,
            lineNumber: i + 1,
            method: 'table'
          });
          processedCodes.add(code);
          console.log(`调试: 表格行解析 - ${code}, 数量: ${qty}, 来源: ${line}`);
          continue;
        }
      }
      
      // 备用解析：产品描述行（如果表格解析失败）
      const codeMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
      if (codeMatch && !line.includes('HK$') && !line.includes('價格') && !line.includes('商品詳情')) {
        const code = codeMatch[1];
        
        // 避免重复处理同一个产品代码
        if (processedCodes.has(code)) {
          continue;
        }
        
        // 查找对应的数量行（通常在附近几行）
        let qty = 0;
        let foundLine = '';
        
        // 检查前后3行，寻找数量和价格的组合
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
          const searchLine = lines[j];
          // 查找包含数量和价格的行
          const qtyPriceMatch = searchLine.match(/\b([1-9]|1[0-9]|20)\s+HK\$[\d,]+\.\d{2}/);
          if (qtyPriceMatch) {
            qty = parseInt(qtyPriceMatch[1], 10);
            foundLine = searchLine;
            console.log(`调试: 在第${j+1}行找到数量: ${qty}, 行内容: ${searchLine}`);
            break;
          }
        }
        
        if (qty > 0) {
          extractedItems.push({
            code,
            qty,
            originalLine: line,
            foundLine: foundLine,
            lineNumber: i + 1,
            method: 'description'
          });
          processedCodes.add(code);
          console.log(`调试: 描述行解析 - ${code}, 数量: ${qty}, 来源: ${line}`);
        }
      }
    }
    
    console.log(`调试: 解析完成，提取到 ${extractedItems.length} 个产品`);
    
    console.log(`\n✅ 增强版解析提取到 ${extractedItems.length} 个有效出货项目:`);
    extractedItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.code} - 数量: ${item.qty} (${item.method})`);
      if (item.method === 'description' && item.foundLine) {
        console.log(`       数量来源: ${item.foundLine}`);
      }
    });
    
    // 验证预期结果
    console.log('\n🎯 验证预期结果:');
    const expectedProducts = [
      { code: 'NM800', qty: 1 },
      { code: 'WS-258PK', qty: 1 },
      { code: 'WS-606BK', qty: 1 },
      { code: 'WS-606PK', qty: 1 }
    ];
    
    let allMatched = true;
    for (const expected of expectedProducts) {
      const found = extractedItems.find(item => item.code === expected.code);
      if (found) {
        if (found.qty === expected.qty) {
          console.log(`✅ ${expected.code}: 期望 ${expected.qty}, 实际 ${found.qty} - 匹配`);
        } else {
          console.log(`❌ ${expected.code}: 期望 ${expected.qty}, 实际 ${found.qty} - 不匹配`);
          allMatched = false;
        }
      } else {
        console.log(`❌ ${expected.code}: 期望 ${expected.qty}, 实际 未找到 - 缺失`);
        allMatched = false;
      }
    }
    
    if (allMatched) {
      console.log('\n🎉 所有预期产品都被正确提取！');
    } else {
      console.log('\n⚠️  部分产品提取不正确，需要进一步优化解析逻辑');
    }
    
    // 分析PDF结构以帮助调试
    console.log('\n🔍 PDF结构分析（查找产品表格）:');
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const line = lines[i];
      if (line.includes('NM800') || line.includes('WS-258PK') || line.includes('WS-606')) {
        console.log(`第${i+1}行: ${line}`);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testEnhancedOutgoingLogic(); 