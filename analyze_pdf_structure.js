// 分析PDF中的實際數據結構
const testData = [
  "WS-409PBK/LB",
  "女士 Sea Dive 高腰收腀平腳泳褲-黑/淺藍 (WS-409PBK/LB)",
  "WS-409PBK/LB3XL 3XL",
  "WS-409PBK/LB",
  "女士 Sea Dive 高腰收腀平腳泳褲-黑/淺藍 (WS-409PBK/LB)",
  "WS-409PBK/LB2XL 2XL",
  "WS-409PBK/LB",
  "女士 Sea Dive 高腰收腀平腳泳褲-黑/淺藍 (WS-409PBK/LB)",
  "WS-409PBK/LBXL XL"
];

console.log("分析PDF數據結構:");
testData.forEach((line, index) => {
  console.log(`第${index + 1}行: "${line}"`);
  
  // 檢查是否匹配產品代碼
  const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
  const codeMatch = line.match(codePattern);
  if (codeMatch) {
    console.log(`  -> 匹配到產品代碼: "${codeMatch[0]}"`);
  }
  
  // 檢查是否為尺寸行
  const sizeMatch = line.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
  if (sizeMatch) {
    console.log(`  -> 尺寸行: 基礎代碼="${sizeMatch[1]}", 尺寸="${(sizeMatch[2] || '1') + sizeMatch[3]}", 數量="${line.match(/\d+$/)?.[0]}"`);
  }
});
