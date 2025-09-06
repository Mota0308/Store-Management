import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import Product from '../models/Product';
import mongoose from 'mongoose';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeCode(s: string) {
  return (s || '').replace(/[]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  const variants = new Set<string>();
  if (n) variants.add(n);
  
  // 提取基礎型號（如 WS-409PBK/LB  WS-409）
  const baseMatch = n.match(/^([A-Z]+[\-]?\d+)/);
  if (baseMatch) {
    variants.add(baseMatch[1]);
  }
  
  // 新增：處理去掉最後一個字符的情況（WS-409PBK/LB  WS-409PBK/L）
  if (n.length > 1) {
    variants.add(n.slice(0, -1));
  }
  
  // 新增：處理去掉最後兩個字符的情況（WS-409PBK/LB  WS-409PBK/）
  if (n.length > 2) {
    variants.add(n.slice(0, -2));
  }
  
  // 新增：處理去掉斜線後面的部分（WS-409PBK/LB  WS-409PBK）
  const slashIndex = n.lastIndexOf('/');
  if (slashIndex > 0) {
    variants.add(n.substring(0, slashIndex));
  }
  
  // 原有邏輯
  const m = n.match(/^([A-Z]+)_?(\d+)$/);
  if (m) variants.add(`${m[1]}-${m[2]}`);
  if (n) variants.add(n.replace(/-/g, ''));
  
  return Array.from(variants).filter(Boolean);
}

// 修復的尺寸匹配函數 - 支持更多格式
function extractSizeAndCode(text: string): { baseCode: string; size: string; quantity: number } | null {
  try {
    console.log(`調試: 嘗試解析尺寸行: "${text}"`);
    
    // 匹配格式: WS-409PBK/LB3XL 3XL 或 WS-409TBKLB3XL 3XL
    const sizeMatch = text.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
    if (sizeMatch) {
      const quantityMatch = text.match(/\d+$/);
      if (quantityMatch) {
        return {
          baseCode: sizeMatch[1],  // WS-409PBK/LB 或 WS-409TBKLB
          size: (sizeMatch[2] || '1') + sizeMatch[3],  // 3XL 或 1XL
          quantity: parseInt(quantityMatch[0], 10)  // 最後的數字
        };
      }
    }
    
    // 新增：匹配格式 WS-409TBKLB3XL 3XL（沒有斜線的情況）
    const sizeMatch2 = text.match(/^(WS-\d+[A-Za-z]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
    if (sizeMatch2) {
      const quantityMatch = text.match(/\d+$/);
      if (quantityMatch) {
        return {
          baseCode: sizeMatch2[1],  // WS-409TBKLB
          size: (sizeMatch2[2] || '1') + sizeMatch2[3],  // 3XL 或 1XL
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

// 新增：生成包含尺寸的產品代碼變體
function codeVariantsWithSize(baseCode: string, size: string): string[] {
  const variants = new Set<string>();
  
  // 添加原始代碼
  variants.add(baseCode);
  
  // 添加帶尺寸的代碼
  variants.add(`${baseCode}${size}`);
  
  // 添加基礎型號變體
  const baseVariants = codeVariants(baseCode);
  baseVariants.forEach(variant => {
    variants.add(variant);
    variants.add(`${variant}${size}`);
  });
  
  return Array.from(variants).filter(Boolean);
}

// 改進的正則表達式，支持更多格式的產品代碼
const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;

function byY(a: any, b: any) { return a.transform[5] - b.transform[5]; }
function byX(a: any, b: any) { return a.transform[4] - b.transform[4]; }

async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number }[]> {
  const loadingTask = getDocument({
    data: buffer,
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const rows: { name: string; code: string; qty: number }[] = [];

  console.log(`調試: PDF總頁數: ${doc.numPages}`);

  for (let p = 1; p <= doc.numPages; p++) {
    console.log(`調試: 處理第 ${p} 頁`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    items.sort(byY);

    const lines: any[][] = [];
    const yTolerance = 2.5;
    for (const it of items) {
      const y = it.transform[5];
      const line = lines.find(L => Math.abs((L as any)._y - y) <= yTolerance);
      if (line) { line.push(it); (line as any)._y = ((line as any)._y + y) / 2; }
      else { const L: any[] = [it]; (L as any)._y = y; lines.push(L); }
    }

    console.log(`調試: 第 ${p} 頁總行數: ${lines.length}`);

    let nameX: [number, number] | null = null;
    let codeX: [number, number] | null = null;
    let qtyX: [number, number] | null = null;

    for (const L of lines) {
      const text = L.map(t => t.str).join('');
      // Expanded header synonyms based on provided PDF formats
      const nameHeadRegex = /(商品詳情|產品描述|商品描述|商品名稱|品名)/;
      const codeHeadRegex = /(型號|條碼號碼|條碼|條形碼|條碼編號|型號編號|貨號)/;
      const qtyHeadRegex = /(數量|數目|總共數量|庫存數量)/;
      const hasNameHead = nameHeadRegex.test(text);
      const hasCodeHead = codeHeadRegex.test(text);
      const hasQtyHead = qtyHeadRegex.test(text);
      if ((hasNameHead && hasQtyHead) && (hasCodeHead || true)) {
        L.sort(byX);
        const parts = L.map(t => ({ x: t.transform[4], s: t.str }));
        const nameHead = parts.find(p => nameHeadRegex.test(p.s));
        const codeHead = parts.find(p => codeHeadRegex.test(p.s));
        const qtyHead = parts.find(p => qtyHeadRegex.test(p.s));
        if (nameHead && qtyHead) {
          // If 型號列缺失，codeX 可為 null，稍後從 name 中提取
          nameX = [nameHead.x - 2, (codeHead ? codeHead.x : qtyHead.x) - 2];
          codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null as any;
          // 放寬數量欄寬，避免長數字被截斷
          qtyX = [qtyHead.x - 2, qtyHead.x + 260];
        }
        console.log(`調試: 找到表頭，nameX: ${nameX}, codeX: ${codeX}, qtyX: ${qtyX}`);
        break;
      }
    }

    if (!nameX || !qtyX) {
      console.log(`調試: 第 ${p} 頁未找到表頭，跳過`);
      continue;
    }

    const headerIndex = lines.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(商品詳情|產品描述|商品描述|商品名稱|品名)/.test(t) && /(數量|數目|總共數量|庫存數量)/.test(t);
    });
    
    console.log(`調試: 表頭索引: ${headerIndex}`);
    
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const L = lines[i].slice().sort(byX);
      const lineText = L.map((t: any) => t.str).join('').trim();
      if (!lineText || /小計|合計|金額|備註|--END--/i.test(lineText)) break;

      const inRange = (x: number, R: [number, number]) => x >= R[0] && x < R[1];
      const pick = (R: [number, number]) => L.filter(t => inRange(t.transform[4], R)).map((t: any) => t.str).join('').trim();

      const name = pick(nameX);
      const codeText = codeX ? pick(codeX) : '';
      const qtyText = pick(qtyX);

      // 型號可出現在型號列或商品詳情列內文中
      const codeSource = `${codeText} ${name}`.trim();
      
      // 添加詳細的調試信息
      if (codeSource.includes('WS-409') || codeSource.includes('409')) {
        console.log(`調試: 找到包含 WS-409 的行 ${i}: "${lineText}"`);
        console.log(`調試: name: "${name}", codeText: "${codeText}", qtyText: "${qtyText}"`);
        console.log(`調試: codeSource: "${codeSource}"`);
      }
      
      const codeMatch = codeSource.match(codePattern);
      // 數量允許更大位數（最多5位），且優先取數量欄位的第一個整數
      const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      
      if (codeMatch) {
        console.log(`調試: 找到產品代碼 "${codeMatch[0]}" 在第 ${i} 行，數量: ${qty}`);
        if (qty > 0) {
          rows.push({ name, code: codeMatch[0], qty });
        }
      }
    }
  }

  console.log(`調試: PDF解析完成，總共提取到 ${rows.length} 個產品`);
  console.log(`調試: 提取的產品代碼:`, rows.map(r => r.code));

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariants(rawCode);
  console.log(`調試: 原始代碼 "${rawCode}" -> 變體:`, variants);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`調試: 查詢結果:`, product ? `找到產品 ${product.productCode}` : '未找到產品');
  if (!product) { 
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

// 新增：帶尺寸的產品更新函數
async function updateByCodeVariantsWithSize(baseCode: string, size: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariantsWithSize(baseCode, size);
  console.log(`調試: 基礎代碼 "${baseCode}" 尺寸 "${size}" -> 變體:`, variants);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`調試: 查詢結果:`, product ? `找到產品 ${product.productCode}` : '未找到產品');
  if (!product) { 
    summary.notFound.push(normalizeCode(`${baseCode}${size}`)); 
    return; 
  }
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body as any;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };

    for (const f of files) {
      let rows: { name: string; code: string; qty: number }[] = [];
      try { rows = await extractByPdfjs(f.buffer); } catch {}
      if (rows.length === 0) {
        const data = await pdf(f.buffer);
        const text = data.text;
        if (text) {
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          console.log(`調試: pdf-parse 解析結果，總行數: ${lines.length}`);
          console.log(`調試: 前10行內容:`, lines.slice(0, 10));
          
          // 查找包含 WS-409 的行
          const ws409Lines = lines.filter(line => line.includes('WS-409'));
          console.log(`調試: 包含 WS-409 的行:`, ws409Lines);
          
          // 修復的數量匹配邏輯 - 基於PDF實際結構，包含尺寸匹配
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (m) {
              console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
              
              // 檢查是否為尺寸行（如 "WS-409PBK/LB3XL 3XL"）
              const sizeInfo = extractSizeAndCode(lines[i]);
              if (sizeInfo) {
                console.log(`調試: 找到尺寸信息 - 基礎代碼: ${sizeInfo.baseCode}, 尺寸: ${sizeInfo.size}, 數量: ${sizeInfo.quantity}`);
                rows.push({ 
                  name: lines[i - 1] || '', 
                  code: sizeInfo.baseCode, 
                  qty: sizeInfo.quantity 
                });
                console.log(`調試: 添加帶尺寸的產品 "${sizeInfo.baseCode}" 尺寸 "${sizeInfo.size}" 數量: ${sizeInfo.quantity}`);
              } else {
                // 原有的數量提取邏輯
                let qty = 0;
                let productName = '';
                
                // 檢查當前行是否包含尺寸和數量（如 "WS-409PBK/LB3XL 3XL"）
                const sizeQtyMatch = lines[i].match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                if (sizeQtyMatch) {
                  qty = parseInt(sizeQtyMatch[1], 10);
                  productName = lines[i - 1] || '';
                  console.log(`調試: 從尺寸行找到數量 ${qty} (${sizeQtyMatch[0]})`);
                } else {
                  // 檢查下一行是否包含尺寸和數量
                  for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                    const nextLine = lines[j];
                    const nextSizeQtyMatch = nextLine.match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                    if (nextSizeQtyMatch) {
                      qty = parseInt(nextSizeQtyMatch[1], 10);
                      productName = lines[i - 1] || '';
                      console.log(`調試: 在第 ${j} 行找到數量 ${qty} (${nextSizeQtyMatch[0]})`);
                      break;
                    }
                    
                    // 檢查是否為純數字行（可能是數量）
                    const pureNumberMatch = nextLine.match(/^\d{1,3}$/);
                    if (pureNumberMatch && parseInt(pureNumberMatch[0], 10) <= 100) {
                      qty = parseInt(pureNumberMatch[0], 10);
                      productName = lines[i - 1] || '';
                      console.log(`調試: 在第 ${j} 行找到純數字數量 ${qty}`);
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
          }
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
    }

    res.json(summary);
  } catch (e) {
    console.error('調試: outgoing 錯誤:', e);
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body as any;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };

    for (const f of files) {
      let rows: { name: string; code: string; qty: number }[] = [];
      try { rows = await extractByPdfjs(f.buffer); } catch {}
      if (rows.length === 0) {
        const data = await pdf(f.buffer);
        const text = data.text;
        if (text) {
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          console.log(`調試: pdf-parse 解析結果，總行數: ${lines.length}`);
          console.log(`調試: 前10行內容:`, lines.slice(0, 10));
          
          // 查找包含 WS-409 的行
          const ws409Lines = lines.filter(line => line.includes('WS-409'));
          console.log(`調試: 包含 WS-409 的行:`, ws409Lines);
          
          // 新增：去重邏輯 - 使用 Map 來追蹤已處理的產品（基礎代碼 + 尺寸）
          const processedProducts = new Map<string, { baseCode: string; size: string; quantity: number }>();
          
          // 修復的數量匹配邏輯 - 基於PDF實際結構，包含尺寸匹配
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (m) {
              console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
              
              // 檢查是否為尺寸行（如 "WS-409PBK/LB3XL 3XL"）
              const sizeInfo = extractSizeAndCode(lines[i]);
              if (sizeInfo) {
                console.log(`調試: 找到尺寸信息 - 基礎代碼: ${sizeInfo.baseCode}, 尺寸: ${sizeInfo.size}, 數量: ${sizeInfo.quantity}`);
                
                // 創建唯一的產品標識符（基礎代碼 + 尺寸）
                const productKey = `${sizeInfo.baseCode}_${sizeInfo.size}`;
                
                // 檢查是否已經處理過這個產品
                if (processedProducts.has(productKey)) {
                  console.log(`調試: 跳過重複的產品 "${productKey}"`);
                  continue;
                }
                
                // 記錄已處理的產品
                processedProducts.set(productKey, {
                  baseCode: sizeInfo.baseCode,
                  size: sizeInfo.size,
                  quantity: sizeInfo.quantity
                });
                
                rows.push({ 
                  name: lines[i - 1] || '', 
                  code: sizeInfo.baseCode, 
                  qty: sizeInfo.quantity 
                });
                console.log(`調試: 添加帶尺寸的產品 "${sizeInfo.baseCode}" 尺寸 "${sizeInfo.size}" 數量: ${sizeInfo.quantity}`);
              } else {
                // 原有的數量提取邏輯
                let qty = 0;
                let productName = '';
                
                // 檢查當前行是否包含尺寸和數量（如 "WS-409PBK/LB3XL 3XL"）
                const sizeQtyMatch = lines[i].match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                if (sizeQtyMatch) {
                  qty = parseInt(sizeQtyMatch[1], 10);
                  productName = lines[i - 1] || '';
                  console.log(`調試: 從尺寸行找到數量 ${qty} (${sizeQtyMatch[0]})`);
                } else {
                  // 檢查下一行是否包含尺寸和數量
                  for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                    const nextLine = lines[j];
                    const nextSizeQtyMatch = nextLine.match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                    if (nextSizeQtyMatch) {
                      qty = parseInt(nextSizeQtyMatch[1], 10);
                      productName = lines[i - 1] || '';
                      console.log(`調試: 在第 ${j} 行找到數量 ${qty} (${nextSizeQtyMatch[0]})`);
                      break;
                    }
                    
                    // 檢查是否為純數字行（可能是數量）
                    const pureNumberMatch = nextLine.match(/^\d{1,3}$/);
                    if (pureNumberMatch && parseInt(pureNumberMatch[0], 10) <= 100) {
                      qty = parseInt(pureNumberMatch[0], 10);
                      productName = lines[i - 1] || '';
                      console.log(`調試: 在第 ${j} 行找到純數字數量 ${qty}`);
                      break;
                    }
                  }
                }
                
                if (qty > 0) {
                  // 創建唯一的產品標識符（產品代碼）
                  const productKey = m[0];
                  
                  // 檢查是否已經處理過這個產品
                  if (processedProducts.has(productKey)) {
                    console.log(`調試: 跳過重複的產品 "${productKey}"`);
                    continue;
                  }
                  
                  // 記錄已處理的產品
                  processedProducts.set(productKey, {
                    baseCode: m[0],
                    size: '',
                    quantity: qty
                  });
                  
                  rows.push({ name: productName, code: m[0], qty });
                  console.log(`調試: 添加產品 "${m[0]}" 數量: ${qty}`);
                } else {
                  console.log(`調試: 產品 "${m[0]}" 未找到有效數量`);
                }
              }
            }
          }
          
          console.log(`調試: 去重後總共處理了 ${processedProducts.size} 個唯一產品`);
          console.log(`調試: 處理的產品列表:`, Array.from(processedProducts.entries()));
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
    }

    res.json(summary);
  } catch (e) {
    console.error('調試: incoming 錯誤:', e);
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

export default router;
