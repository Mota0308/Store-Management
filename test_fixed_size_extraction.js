// 修復的尺寸提取函數
function extractSizeAndCode(text) {
  try {
    console.log(`調試: 嘗試解析尺寸行: "${text}"`);
    
    // 修復正則表達式，支持更多格式
    // 匹配格式: WS-409PBK/LB3XL 3XL 或 WS-512PP2XL 2XL
    const sizeMatch = text.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
    if (sizeMatch) {
      const quantityMatch = text.match(/\d+$/);
      if (quantityMatch) {
        return {
          baseCode: sizeMatch[1],  // WS-409PBK/LB
          size: (sizeMatch[2] || '1') + sizeMatch[3],  // 3XL 或 1XL
          quantity: parseInt(quantityMatch[0], 10)  // 最後的數字
        };
      }
    }
    return null;
  } catch (error) {
    console.log(`調試: extractSizeAndCode 錯誤:`, error);
    return null;
  }
}

// 測試修復後的函數
const testLines = [
  "WS-409PBK/LB3XL 3XL",
  "WS-512PP2XL 2XL", 
  "WS-512PPXL XL",
  "WS-512PPL L",
  "WS-512PPM M",
  "WS-512PPS S",
  "WS-512PPXS XS"
];

console.log("測試修復後的尺寸提取函數:");
testLines.forEach(line => {
  const result = extractSizeAndCode(line);
  console.log(`"${line}" ->`, result);
});
