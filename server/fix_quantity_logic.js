// 修復數量匹配邏輯
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(codePattern);
  if (m) {
    console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
    
    // 改進的數量匹配邏輯
    let qty = 0;
    let productName = '';
    
    // 檢查當前行是否包含數量（如 "WS-409PBK/LB3XL 3XL"）
    const currentLineQty = lines[i].match(/(\d+)\s*$/);
    if (currentLineQty) {
      qty = parseInt(currentLineQty[1], 10);
      productName = lines[i - 1] || '';
    } else {
      // 檢查下一行是否包含數量
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const q = lines[j].match(/\b(\d{1,5})\b/);
        if (q) {
          qty = parseInt(q[1], 10);
          productName = lines[i - 1] || '';
          console.log(`調試: 在第 ${j} 行找到數量 ${qty}`);
          break;
        }
      }
    }
    
    if (qty > 0) {
      rows.push({ name: productName, code: m[0], qty });
      console.log(`調試: 添加產品 "${m[0]}" 數量: ${qty}`);
    } else {
      console.log(`調試: 產品 "${m[0]}" 未找到有效數量`);
    }
  }
}
