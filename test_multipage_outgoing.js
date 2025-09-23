// 测试多页PDF出货解析逻辑
const fs = require('fs');
const pdf = require('pdf-parse');

// 解析产品表格行的函数
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
      // 组合尺寸和购买类型用于数据库匹配
      let combinedSize = '';
      if (size && purchaseType) {
        // 创建两种可能的组合格式：尺寸|购买类型 和 购买类型|尺寸
        combinedSize = `${size} | ${purchaseType}`;
        console.log(`调试: 组合尺寸格式: "${combinedSize}" (备选: "${purchaseType} | ${size}")`);
      } else if (size) {
        combinedSize = size;
      } else if (purchaseType) {
        combinedSize = purchaseType;
      }
      
      console.log(`调试: 最终解析结果 - 型号: ${productCode}, 数量: ${quantity}, 组合尺寸: ${combinedSize || '无'}`);
      return {
        code: productCode,
        quantity: quantity,
        size: combinedSize || undefined,
        purchaseType: undefined, // 不再单独使用购买类型，已组合到size中
        // 保存原始信息用于备选匹配
        originalSize: size || undefined,
        originalPurchaseType: purchaseType || undefined
      };
    }
    
    return null;
  } catch (error) {
    console.error('解析产品行时出错:', error);
    return null;
  }
}

async function testMultipageOutgoingLogic() {
  try {
    console.log('🧪 测试多页PDF出货解析逻辑...\n');
    
    const pdfPath = '1.pdf';
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // 首先获取PDF基本信息
    const data = await pdf(dataBuffer);
    console.log(`📄 PDF总页数: ${data.numpages}`);
    console.log(`📄 PDF总文本长度: ${data.text.length} 字符\n`);

    // 解析每一页
    const allExtractedProducts = [];
    
    for (let pageNum = 1; pageNum <= data.numpages; pageNum++) {
      console.log(`\n📖 开始解析第 ${pageNum} 页`);
      console.log(`${'='.repeat(50)}`);
      
      // 解析指定页面
      const pageData = await pdf(dataBuffer, { max: pageNum, min: pageNum });
      const text = pageData.text;
      
      if (text) {
        console.log(`📄 第 ${pageNum} 页文本长度: ${text.length} 字符`);

        // 查找产品表格的开始和结束
        const tableStartKeywords = ['商品詳情', '型號', '數量', '價格'];
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        let inProductTable = false;
        const pageExtractedProducts = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 检测表格开始
          if (tableStartKeywords.some(keyword => line.includes(keyword))) {
            inProductTable = true;
            console.log(`✅ 第${pageNum}页发现产品表格标题行 ${i+1}: ${line}`);
            continue;
          }

          // 检测表格结束
          if (line.includes('--END--') || line.includes('總計') || line.includes('合計')) {
            inProductTable = false;
            console.log(`🏁 第${pageNum}页产品表格结束于第 ${i+1} 行`);
            break;
          }

          // 在表格区域内解析产品信息
          if (inProductTable) {
            // 查找包含产品型号的行
            const productMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
            if (productMatch && !line.includes('套裝') && !line.includes('發纏號碼')) {
              const productCode = productMatch[1];

              console.log(`🔍 第${pageNum}页第${i+1}行发现产品型号: ${productCode}`);
              console.log(`📝 产品行内容: ${line}`);

              // 分析当前行来提取信息
              const productInfo = parseProductTableRow(line, lines, i);

              if (productInfo) {
                pageExtractedProducts.push({
                  page: pageNum,
                  name: '',
                  code: productInfo.code,
                  qty: productInfo.quantity,
                  size: productInfo.size,
                  purchaseType: productInfo.purchaseType,
                  originalSize: productInfo.originalSize,
                  originalPurchaseType: productInfo.originalPurchaseType
                });

                console.log(`✅ 第${pageNum}页成功解析产品 - 型号: ${productInfo.code}, 数量: ${productInfo.quantity}, 组合尺寸: ${productInfo.size || '无'}`);
              }
            }
          }
        }

        console.log(`📊 第${pageNum}页解析完成，提取到 ${pageExtractedProducts.length} 个产品`);
        allExtractedProducts.push(...pageExtractedProducts);
      } else {
        console.log(`⚠️ 第${pageNum}页无文本内容`);
      }
    }

    // 累加处理（跨页面）- 相同产品的数量要累加而不是去重
    console.log(`\n🔄 开始数量累加处理...`);
    const productMap = new Map();

    for (const product of allExtractedProducts) {
      const key = `${product.code}-${product.size || ''}-${product.purchaseType || ''}`;
      
      if (productMap.has(key)) {
        // 如果已存在，累加数量
        const existingProduct = productMap.get(key);
        existingProduct.qty += product.qty;
        console.log(`➕ 累加产品 ${product.code} 数量: ${product.qty} -> 总计: ${existingProduct.qty} (页面${product.page})`);
      } else {
        // 如果不存在，新增产品
        productMap.set(key, { ...product });
        console.log(`🆕 新增产品 ${product.code} 数量: ${product.qty} (页面${product.page})`);
      }
    }

    const finalProducts = Array.from(productMap.values());

    console.log(`\n🎯 最终统计:`);
    console.log(`📄 总页数: ${data.numpages}`);
    console.log(`🔍 原始提取产品数: ${allExtractedProducts.length}`);
    console.log(`📊 累加后产品种类数: ${finalProducts.length}`);
    
    console.log(`\n📋 最终产品列表（累加后）:`);
    finalProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.code} - 累加数量: ${product.qty}, 尺寸: ${product.size || '无'}`);
    });

    console.log(`\n🎉 多页PDF解析测试完成！`);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testMultipageOutgoingLogic(); 