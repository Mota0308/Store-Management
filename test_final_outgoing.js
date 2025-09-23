// 测试最终版出货解析逻辑
const fs = require('fs');
const pdf = require('pdf-parse');

// 解析产品表格行的函数（与服务器端同步）
function parseProductTableRow(line, lines, currentIndex) {
  try {
    // 查找产品型号
    const codeMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
    if (!codeMatch) return null;
    
    const productCode = codeMatch[1];
    
    // 查找包含尺寸和购买类型信息的后续行
    let size = '';
    let purchaseType = '';
    
    // 在后续几行中查找详细信息行（通常在产品描述后的下一行）
    for (let j = currentIndex + 1; j <= Math.min(lines.length - 1, currentIndex + 4); j++) {
      const detailLine = lines[j];
      
      // 跳过价格行和无关行
      if (detailLine.includes('HK$') || detailLine.includes(productCode)) {
        continue;
      }
      
      console.log(`调试: 检查第${j+1}行详细信息: ${detailLine}`);
      
      // 查找尺寸信息
      const sizeMatch = detailLine.match(/尺寸?\s*[:：]?\s*([^\s,，]+)/);
      if (sizeMatch) {
        size = sizeMatch[1].trim();
        console.log(`调试: 找到尺寸信息: ${size}`);
      }
      
             // 查找购买类型信息 (处理字符编码问题，"類"可能显示为"觊")
       const purchaseTypeMatch = detailLine.match(/購買[類觊]型\s*[:：]?\s*([^\s,，]+)/);
       if (purchaseTypeMatch) {
         purchaseType = purchaseTypeMatch[1].trim();
         console.log(`调试: 找到购买类型: ${purchaseType}`);
       }
      
             // 如果同时找到了尺寸和购买类型信息，就可以停止搜索了
       if (size && purchaseType) {
         break;
       }
    }
    
    // 查找数量 - 在后续行中查找数量+价格的组合
    let quantity = 0;
    
    for (let j = currentIndex + 1; j <= Math.min(lines.length - 1, currentIndex + 4); j++) {
      const nextLine = lines[j];
      
      // 查找格式如 "WS-258PK1HK$423.00HK$423.00" 的行
      const qtyPriceMatch = nextLine.match(new RegExp(`${productCode}(\\d+)HK\\$`));
      if (qtyPriceMatch) {
        const qty = parseInt(qtyPriceMatch[1], 10);
        if (qty > 0 && qty <= 50) { // 放宽数量限制到50
          quantity = qty;
          console.log(`调试: 在第${j+1}行找到数量 ${quantity}: ${nextLine}`);
          break;
        }
      }
      
      // 特殊处理NM系列
      if (productCode.startsWith('NM') && nextLine.includes(productCode) && nextLine.includes('HK$')) {
        const nmMatch = nextLine.match(new RegExp(`${productCode}(\\d+)HK\\$`));
        if (nmMatch) {
          const qty = parseInt(nmMatch[1], 10);
          if (qty > 0 && qty <= 50) {
            quantity = qty;
            console.log(`调试: NM系列在第${j+1}行找到数量 ${quantity}: ${nextLine}`);
            break;
          }
        }
      }
    }
    
    if (quantity > 0) {
      console.log(`调试: 最终解析结果 - 型号: ${productCode}, 数量: ${quantity}, 尺寸: ${size || '无'}, 购买类型: ${purchaseType || '无'}`);
      return {
        code: productCode,
        quantity: quantity,
        size: size || undefined,
        purchaseType: purchaseType || undefined
      };
    }
    
    return null;
  } catch (error) {
    console.error('解析产品行时出错:', error);
    return null;
  }
}

async function testFinalOutgoingLogic() {
  try {
    console.log('🧪 测试最终版出货解析逻辑...\n');
    
    const pdfPath = '1.pdf';
    
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF文件不存在:', pdfPath);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    console.log('📄 使用最终版逻辑解析PDF...');
    
    const text = data.text;
    console.log('调试: 开始解析出货PDF，采用表格结构解析');
    
    // 查找产品表格的开始和结束
    const tableStartKeywords = ['商品詳情', '型號', '數量', '價格'];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    let inProductTable = false;
    const extractedProducts = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检测表格开始
      if (tableStartKeywords.some(keyword => line.includes(keyword))) {
        inProductTable = true;
        console.log(`调试: 发现产品表格标题行 ${i+1}: ${line}`);
        continue;
      }
      
      // 检测表格结束
      if (line.includes('--END--') || line.includes('總計') || line.includes('合計')) {
        inProductTable = false;
        console.log(`调试: 产品表格结束于第 ${i+1} 行`);
        break;
      }
      
      // 在表格区域内解析产品信息
      if (inProductTable) {
        // 查找包含产品型号的行
        const productMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
        if (productMatch && !line.includes('套裝') && !line.includes('發纏號碼')) {
          const productCode = productMatch[1];
          
          console.log(`调试: 第${i+1}行发现产品型号: ${productCode}`);
          console.log(`调试: 产品行内容: ${line}`);
          
          // 分析当前行来提取信息
          const productInfo = parseProductTableRow(line, lines, i);
          
          if (productInfo) {
            extractedProducts.push({
              name: '',
              code: productInfo.code,
              qty: productInfo.quantity,
              size: productInfo.size,
              purchaseType: productInfo.purchaseType
            });
            
            console.log(`调试: 成功解析产品 - 型号: ${productInfo.code}, 数量: ${productInfo.quantity}, 尺寸: ${productInfo.size || '无'}, 购买类型: ${productInfo.purchaseType || '无'}`);
          }
        }
      }
    }
    
    // 去重处理
    const uniqueProducts = [];
    const seenKeys = new Set();
    
    for (const product of extractedProducts) {
      const key = `${product.code}-${product.size || ''}-${product.purchaseType || ''}`;
      if (!seenKeys.has(key)) {
        uniqueProducts.push(product);
        seenKeys.add(key);
      }
    }
    
    console.log(`\n✅ 最终版解析提取到 ${uniqueProducts.length} 个唯一产品:`);
    uniqueProducts.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.code} - 数量: ${item.qty}${item.size ? `, 尺寸: ${item.size}` : ''}${item.purchaseType ? `, 类型: ${item.purchaseType}` : ''}`);
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
    let totalMatched = 0;
    
    for (const expected of expectedProducts) {
      const found = uniqueProducts.find(item => item.code === expected.code);
      if (found) {
        if (found.qty === expected.qty) {
          console.log(`✅ ${expected.code}: 期望 ${expected.qty}, 实际 ${found.qty} - 匹配`);
          totalMatched++;
        } else {
          console.log(`⚠️  ${expected.code}: 期望 ${expected.qty}, 实际 ${found.qty} - 数量不匹配`);
        }
      } else {
        console.log(`❌ ${expected.code}: 期望 ${expected.qty}, 实际 未找到 - 缺失`);
        allMatched = false;
      }
    }
    
    console.log(`\n📊 匹配结果: ${totalMatched}/${expectedProducts.length} 个产品被正确提取`);
    
    if (totalMatched === expectedProducts.length) {
      console.log('🎉 所有预期产品都被正确提取！出货功能解析逻辑完美！');
    } else if (totalMatched > 0) {
      console.log('✅ 部分产品被正确提取，解析逻辑基本正确，可能需要微调');
    } else {
      console.log('⚠️  没有产品被正确提取，需要进一步调试解析逻辑');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testFinalOutgoingLogic(); 