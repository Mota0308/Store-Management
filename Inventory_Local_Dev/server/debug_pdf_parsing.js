// 在 imports.ts 中添加更詳細的調試信息
const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
console.log(`調試: PDF解析結果，總行數: ${lines.length}`);
console.log(`調試: 前10行內容:`, lines.slice(0, 10));

// 查找包含 WS-409 的行
const ws409Lines = lines.filter(line => line.includes('WS-409'));
console.log(`調試: 包含 WS-409 的行:`, ws409Lines);

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(codePattern);
  if (m) {
    console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
  }
}
