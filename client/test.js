function normalizeCode(s) {
  return (s || '').replace(/[]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw) {
  const n = normalizeCode(raw);
  const variants = new Set();
  if (n) variants.add(n);
  
  const baseMatch = n.match(/^([A-Z]+[\-]?\d+)/);
  if (baseMatch) {
    variants.add(baseMatch[1]);
  }
  
  if (n.length > 1) {
    variants.add(n.slice(0, -1));
  }
  
  if (n.length > 2) {
    variants.add(n.slice(0, -2));
  }
  
  const slashIndex = n.lastIndexOf('/');
  if (slashIndex > 0) {
    variants.add(n.substring(0, slashIndex));
  }
  
  const m = n.match(/^([A-Z]+)_?(\d+)$/);
  if (m) variants.add(m[1] + '-' + m[2]);
  if (n) variants.add(n.replace(/-/g, ''));
  
  return Array.from(variants).filter(Boolean);
}

console.log('原始代碼: WS-409PBK/LB');
console.log('標準化後:', normalizeCode('WS-409PBK/LB'));
console.log('生成的變體:', codeVariants('WS-409PBK/LB'));
