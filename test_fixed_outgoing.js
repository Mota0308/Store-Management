// 测试修复后的出货解析逻辑
const fs = require('fs');
const pdf = require('pdf-parse');

async function testFixedOutgoingLogic() {
  try {
    console.log('🧪 测试修复后的出货解析逻辑...\n');
    
    const pdfPath = '1.pdf';
    
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF文件不存在:', pdfPath);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    console.log('📄 使用修复后的逻辑解析PDF...');
    
    const text = data.text;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const processedCodes = new Set(); // 避免重复处理
    const extractedItems = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 更严格的产品代码匹配，排除价格行
      const codeMatch = line.match(/\b(WS-\d+\w*)\b/);
      if (codeMatch && !line.includes('HK$') && !line.includes('價格')) {
        const code = codeMatch[1];
        
        // 避免重复处理同一个产品代码
        if (processedCodes.has(code)) {
          continue;
        }
        
        // 查找实际数量，限制在合理范围内（1-20）
        let qty = 0;
        
        // 在当前行查找数量
        const qtyMatch = line.match(/\b([1-9]|1[0-9]|20)\b/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10);
        } else {
          // 在下一行查找数量（通常数量在产品描述的下一行）
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            // 只有当下一行不包含价格信息时才查找数量
            if (!nextLine.includes('HK$')) {
              const nextQtyMatch = nextLine.match(/\b([1-9]|1[0-9]|20)\b/);
              if (nextQtyMatch) {
                qty = parseInt(nextQtyMatch[1], 10);
              }
            }
          }
        }
        
        if (qty > 0) {
          extractedItems.push({
            code,
            qty,
            originalLine: line,
            lineNumber: i + 1
          });
          processedCodes.add(code);
          console.log(`调试: 出货解析 - ${code}, 数量: ${qty}, 来源: ${line}`);
        }
      }
    }
    
    console.log(`\n✅ 修复后提取到 ${extractedItems.length} 个有效出货项目:`);
    extractedItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.code} - 数量: ${item.qty}`);
    });
    
    // 验证修复效果
    console.log('\n🔍 修复效果验证:');
    
    // 检查是否还有异常高的数量
    const highQuantityItems = extractedItems.filter(item => item.qty > 20);
    if (highQuantityItems.length === 0) {
      console.log('✅ 已修复：没有异常高的数量值');
    } else {
      console.log(`❌ 仍有 ${highQuantityItems.length} 个异常高数量项目`);
    }
    
    // 检查重复项目
    const allCodes = extractedItems.map(item => item.code);
    const duplicates = allCodes.filter((code, index) => allCodes.indexOf(code) !== index);
    if (duplicates.length === 0) {
      console.log('✅ 已修复：没有重复的产品代码');
    } else {
      console.log(`❌ 仍有重复的产品代码: ${[...new Set(duplicates)].join(', ')}`);
    }
    
    // 检查价格误识别
    const priceRelatedCodes = extractedItems.filter(item => 
      item.code.includes('HK') || item.originalLine.includes('HK$')
    );
    if (priceRelatedCodes.length === 0) {
      console.log('✅ 已修复：没有价格相关的误识别');
    } else {
      console.log(`❌ 仍有价格相关误识别: ${priceRelatedCodes.length} 个`);
    }
    
    console.log('\n📊 解析结果统计:');
    console.log(`📦 有效产品代码: ${extractedItems.length} 个`);
    console.log(`🔢 数量范围: ${Math.min(...extractedItems.map(i => i.qty))} - ${Math.max(...extractedItems.map(i => i.qty))}`);
    console.log(`📈 总出货数量: ${extractedItems.reduce((sum, item) => sum + item.qty, 0)} 件`);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testFixedOutgoingLogic(); 