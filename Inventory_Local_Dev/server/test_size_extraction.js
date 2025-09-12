// 檢查尺寸提取函數的正則表達式
const testLines = [
  "WS-409PBK/LB3XL 3XL",
  "WS-409PBK/LB2XL 2XL", 
  "WS-409PBK/LBXL XL",
  "WS-409PBK/LBL L",
  "WS-409PBK/LBM M",
  "WS-409PBK/LBS S"
];

function extractSizeAndCode(text) {
  // 修復正則表達式，支持更多格式
  const sizeMatch = text.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
  if (sizeMatch) {
    return {
      baseCode: sizeMatch[1],
      size: (sizeMatch[2] || '1') + sizeMatch[3],
      quantity: parseInt(text.match(/\d+$/)[0], 10)
    };
  }
  return null;
}

console.log("測試尺寸提取函數:");
testLines.forEach(line => {
  const result = extractSizeAndCode(line);
  console.log(`"${line}" ->`, result);
});
