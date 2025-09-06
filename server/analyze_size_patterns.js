// 分析PDF中的尺寸格式
const sizeExamples = [
  "WS-409PBK/LB3XL 3XL",  // 3XL 尺寸
  "WS-409PBK/LB2XL 2XL",  // 2XL 尺寸  
  "WS-409PBK/LBXL XL",    // XL 尺寸
  "WS-409PBK/LBL L",      // L 尺寸
  "WS-409PBK/LBM M",      // M 尺寸
  "WS-409PBK/LBS S",      // S 尺寸
  "WS-512WHXS XS",        // XS 尺寸
  "WS-231LB2XS 2XS",      // 2XS 尺寸
];

console.log("PDF中的尺寸格式分析:");
sizeExamples.forEach((example, i) => {
  const sizeMatch = example.match(/(\d*)(XL|L|M|S|XS|XXS)/);
  if (sizeMatch) {
    console.log(`${i+1}. "${example}" -> 尺寸: ${sizeMatch[0]}, 數字: ${sizeMatch[1] || '1'}, 字母: ${sizeMatch[2]}`);
  }
});

// 尺寸匹配邏輯
function extractSizeAndCode(text) {
  // 匹配格式: WS-409PBK/LB3XL 3XL
  const sizeMatch = text.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
  if (sizeMatch) {
    return {
      baseCode: sizeMatch[1],  // WS-409PBK/LB
      size: sizeMatch[2] + sizeMatch[3],  // 3XL
      quantity: parseInt(text.match(/\d+$/)[0], 10)  // 最後的數字
    };
  }
  return null;
}

console.log("\n尺寸提取測試:");
sizeExamples.forEach(example => {
  const result = extractSizeAndCode(example);
  if (result) {
    console.log(`"${example}" -> 基礎代碼: ${result.baseCode}, 尺寸: ${result.size}, 數量: ${result.quantity}`);
  }
});
