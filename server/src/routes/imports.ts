import express from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Location from '../models/Location';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = express.Router();

// 配置multer使用內存存儲
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB限制
});

// 輔助函數
function normalizeCode(s: string) {
  return (s || '').replace(/[—–‑–−]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  const variants = new Set<string>();
  if (n) variants.add(n);
  const m = n.match(/^([A-Z]+)_?(\d+)([A-Z]*)(?:\/([A-Z]+))?$/);
  if (m) {
    variants.add(`${m[1]}-${m[2]}${m[3] || ''}`);
    if (m[4]) {
      variants.add(`${m[1]}-${m[2]}${m[3] || ''}/${m[4]}`);
    }
  }
  if (n) variants.add(n.replace(/-/g, ''));
  return Array.from(variants).filter(Boolean);
}

// Support alphanumeric model codes like AB-1234, AB-1234CD, AB-1234CD/EF and numeric-only barcodes (EAN-8/12/13/14)
const codePattern = /(?:[A-Z]{1,8}[\-—–‑–−]?\d{2,8}(?:[A-Z]+)?(?:\/[A-Z]+)?)|(?:\b\d{8,14}\b)/;

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

  for (let p = 1; p <= doc.numPages; p++) {
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
        break;
      }
    }

    if (!nameX || !qtyX) continue;

    const headerIndex = lines.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(商品詳情|產品描述|商品描述|商品名稱|品名)/.test(t) && /(數量|數目|總共數量|庫存數量)/.test(t);
    });
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
      const codeMatch = codeSource.match(codePattern);
      // 數量允許更大位數（最多5位），且優先取數量欄位的第一個整數
      const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      if (codeMatch && qty > 0) rows.push({ name, code: codeMatch[0], qty });
    }
  }

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  if (!product) { summary.notFound.push(normalizeCode(rawCode)); return; }
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await product.save();
    summary.updated++;
}

// 進貨功能
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到進貨請求');
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('調試: locationId =', locationId);
    console.log('調試: 收到文件數量 =', files?.length || 0);
    
    if (!locationId) {
      return res.status(400).json({ message: 'Missing locationId' });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Missing files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      created: 0,
      updated: 0, 
      notFound: [] as string[], 
      parsed: [] as any[],
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        let rows: { name: string; code: string; qty: number }[] = [];
        try { 
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF.js 解析失敗，嘗試使用 pdf-parse:', pdfjsError);
        }
        
        if (rows.length === 0) {
            const data = await pdf(file.buffer);
            const text = data.text;
            if (text) {
              const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
              for (let i = 0; i < lines.length; i++) {
              const m = lines[i].match(codePattern);
              if (!m) continue;
              for (let j = i; j <= i + 6 && j < lines.length; j++) {
                const q = lines[j].match(/\b(\d{1,5})\b/);
                if (q) { rows.push({ name: lines[i - 1] || '', code: m[0], qty: parseInt(q[1], 10) }); break; }
              }
            }
          }
        }

        console.log(`調試: 從 PDF 提取到 ${rows.length} 行數據:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        for (const r of rows) {
          console.log(`調試: 處理行數據:`, r);
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
        }
      } catch (fileError) {
        console.error('調試: 進貨處理錯誤:', fileError);
        summary.errors.push(`文件 ${file.originalname} 處理錯誤: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('調試: 進貨處理錯誤:', e);
    res.status(500).json({ message: 'Failed to process incoming', error: String(e) });
  }
});

// 出貨功能
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body as any;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[], errors: [] as string[] };

    for (const f of files) {
      let rows: { name: string; code: string; qty: number }[] = [];
      try { rows = await extractByPdfjs(f.buffer); } catch {}
      if (rows.length === 0) {
        const data = await pdf(f.buffer);
        const text = data.text;
        if (text) {
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (!m) continue;
            for (let j = i; j <= i + 6 && j < lines.length; j++) {
              const q = lines[j].match(/\b(\d{1,5})\b/);
              if (q) { rows.push({ name: lines[i - 1] || '', code: m[0], qty: parseInt(q[1], 10) }); break; }
            }
          }
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

// 門市對調功能
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到門市對調請求');
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!fromLocationId || !toLocationId) {
      return res.status(400).json({ message: 'Missing location IDs' });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Missing files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      updated: 0, 
      notFound: [] as string[], 
      parsed: [] as any[],
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        let rows: { name: string; code: string; qty: number }[] = [];
        try { 
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF.js 解析失敗，嘗試使用 pdf-parse:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
          const text = data.text;
          if (text) {
            const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              const m = lines[i].match(codePattern);
              if (!m) continue;
              for (let j = i; j <= i + 6 && j < lines.length; j++) {
                const q = lines[j].match(/\b(\d{1,5})\b/);
                if (q) { rows.push({ name: lines[i - 1] || '', code: m[0], qty: parseInt(q[1], 10) }); break; }
              }
            }
          }
        }

        console.log(`調試: 從 PDF 提取到 ${rows.length} 行數據:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          summary.processed++;
          
          // 查找現有產品
          const variants = codeVariants(r.code);
          if (variants.length === 0) continue;
          
          const product = await Product.findOne({ productCode: { $in: variants } });
          if (!product) { 
            summary.notFound.push(normalizeCode(r.code)); 
            continue; 
          }
          
          summary.matched++;
          
          // 減少來源門市庫存
          let fromInventory = product.inventories.find((inv: any) => 
            inv.locationId.toString() === fromLocationId
          );
          
          if (fromInventory && fromInventory.quantity >= r.qty) {
            fromInventory.quantity -= r.qty;
            
            // 增加目標門市庫存
            let toInventory = product.inventories.find((inv: any) => 
              inv.locationId.toString() === toLocationId
            );
            
            if (toInventory) {
              toInventory.quantity += r.qty;
            } else {
              product.inventories.push({
                locationId: new mongoose.Types.ObjectId(toLocationId),
                quantity: r.qty
              });
            }
            
            await product.save();
            summary.updated++;
          } else {
            summary.notFound.push(`產品 ${r.code} 在來源門市庫存不足`);
          }
        }
      } catch (fileError) {
        summary.notFound.push(`文件 ${file.originalname} 處理錯誤: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('調試: 門市對調處理錯誤:', e);
    res.status(500).json({ message: 'Failed to process transfer', error: String(e) });
  }
});

// Excel導入功能 - 完全修復版本
router.post('/excel', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到Excel導入請求');
    const files = req.files as Express.Multer.File[];
    console.log('調試: 收到Excel文件數量 =', files?.length || 0);
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Missing Excel files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      created: 0,
      updated: 0, 
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        console.log(`調試: 處理文件 ${file.originalname}, 大小: ${file.size} bytes`);
        
        // 檢查文件大小
        if (file.size > 10 * 1024 * 1024) { // 10MB限制
          summary.errors.push(`文件 ${file.originalname} 太大 (${Math.round(file.size / 1024 / 1024)}MB)，請使用較小的文件`);
          continue;
        }
        
        // 檢查文件類型
        if (!file.originalname.match(/\.(xlsx|xls)$/i)) {
          summary.errors.push(`文件 ${file.originalname} 不是有效的Excel文件`);
          continue;
        }
        
        // 讀取Excel文件 - 優化選項
        const workbook = XLSX.read(file.buffer, { 
          type: 'buffer',
          cellDates: false, // 關閉日期解析以提高性能
          cellNF: false,
          cellText: false,
          raw: true, // 使用原始值以提高性能
          dense: true // 使用密集模式
        });
        
        console.log('調試: Excel工作表名稱:', workbook.SheetNames);
        
        if (workbook.SheetNames.length === 0) {
          summary.errors.push(`文件 ${file.originalname}: 沒有找到工作表`);
          continue;
        }
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          summary.errors.push(`文件 ${file.originalname}: 無法讀取工作表 "${sheetName}"`);
          continue;
        }
        
        // 轉換為JSON - 優化選項
        const data = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false,
          raw: true // 使用原始值
        }) as any[][];
        
        console.log('調試: Excel數據行數:', data.length);
        
        if (data.length < 2) {
          summary.errors.push(`文件 ${file.originalname}: 數據行數不足 (只有 ${data.length} 行)`);
          continue;
        }
        
        // 限制處理的行數，避免超時
        const maxRows = Math.min(data.length, 2000); // 最多處理2000行
        if (data.length > 2000) {
          summary.errors.push(`文件 ${file.originalname}: 數據行數過多 (${data.length} 行)，只處理前2000行`);
        }
        
        // 獲取標題行（第一行）
        const headers = data[0] as any[];
        console.log('調試: Excel標題行:', headers);
        
        // 清理標題行
        const cleanHeaders = headers.map((h: any) => {
          if (h === null || h === undefined) return '';
          return String(h).trim();
        }).filter((h: string) => h !== '');
        
        console.log('調試: 清理後的標題行:', cleanHeaders);
        
        // 列映射 - 支持更多變體
        const columnIndexes: Record<string, number> = {};
        const columnMappings: Record<string, string[]> = {
          'productCode': ['編號', '型號', '產品編號', '貨號', 'SKU', '產品代碼', '代碼', '編碼', '商品編號', '產品代號'],
          'productName': ['產品', '商品詳情', '商品名稱', '產品名稱', '名稱', '商品', '品名', '商品描述', '產品描述'],
          'size': ['尺寸', '商品選項', '規格', '選項', '尺碼', '大小', '規格尺寸', '商品規格'],
          '觀塘': ['觀塘', '觀塘店', '觀塘門市', '觀塘倉', '觀塘庫存', '觀塘區'],
          '灣仔': ['灣仔', '灣仔店', '灣仔門市', '灣仔倉', '灣仔庫存', '灣仔區'],
          '荔枝角': ['荔枝角', '荔枝角店', '荔枝角門市', '荔枝角倉', '荔枝角庫存', '荔枝角區'],
          '元朗': ['元朗', '元朗店', '元朗門市', '元朗倉', '元朗庫存', '元朗區'],
          '國内倉': ['國內倉', '國内倉', '倉庫', '總倉', '國内', '國內', '國内倉庫', '國內倉庫', '內地倉', '大陸倉']
        };
        
        // 識別列索引 - 改進匹配邏輯
        for (const [columnType, variants] of Object.entries(columnMappings)) {
          let found = false;
          for (const variant of variants) {
            const index = cleanHeaders.findIndex((h: string) => h === variant);
            if (index !== -1) {
              columnIndexes[columnType] = index;
              found = true;
              console.log(`調試: 找到列 "${columnType}" 對應 "${variant}" 在索引 ${index}`);
              break;
            }
          }
          if (!found && ['productCode', 'productName', 'size'].includes(columnType)) {
            const errorMsg = `文件 ${file.originalname}: 缺少必需列 "${columnType}" (支持的變體: ${variants.join(', ')})`;
            console.log('調試:', errorMsg);
            summary.errors.push(errorMsg);
          }
        }
        
        // 檢查必需的列是否存在
        if (columnIndexes.productCode === undefined || columnIndexes.productName === undefined || columnIndexes.size === undefined) {
          console.log('調試: 缺少必需列，跳過此文件');
          continue;
        }
        
        // 獲取門市ID映射
        const locations = await Location.find({});
        const locationMap: Record<string, string> = {};
        locations.forEach((loc: any) => {
          locationMap[loc.name] = loc._id.toString();
        });
        
        console.log('調試: 門市映射:', locationMap);
        
        // 批量處理數據以提高性能
        const batchSize = 100; // 每批處理100行
        for (let start = 1; start < maxRows; start += batchSize) {
          const end = Math.min(start + batchSize, maxRows);
          const batch = data.slice(start, end);
          
          // 處理批次
          for (let i = 0; i < batch.length; i++) {
            const rowIndex = start + i;
            const row = batch[i] as any[];
            if (!row || row.length === 0) continue;
            
            try {
              // 提取基本產品信息
              const productCode = row[columnIndexes.productCode];
              const productName = row[columnIndexes.productName];
              const size = row[columnIndexes.size];
              
              // 轉換為字符串並清理
              const cleanProductCode = productCode ? String(productCode).trim() : '';
              const cleanProductName = productName ? String(productName).trim() : '';
              const cleanSize = size ? String(size).trim() : '';
              
              if (!cleanProductCode || !cleanProductName || !cleanSize) {
                summary.errors.push(`第${rowIndex+1}行: 編號、產品名稱或尺寸為空 (編號: "${cleanProductCode}", 名稱: "${cleanProductName}", 尺寸: "${cleanSize}")`);
                continue;
              }
              
              summary.processed++;
              
              // 查找現有產品 - 改進查詢邏輯，避免重複創建
              let product = await Product.findOne({
                $and: [
                  { productCode: cleanProductCode }, // 主要按產品代碼查找
                  {
                    $or: [
                      { size: cleanSize },           // 尺寸匹配
                      { sizes: { $in: [cleanSize] } }
                    ]
                  }
                ]
              });

              // 如果沒找到，再嘗試按名稱和代碼查找（更寬鬆的條件）
              if (!product) {
                product = await Product.findOne({
                  $and: [
                    { name: cleanProductName },
                    { productCode: cleanProductCode }
                  ]
                });
              }
              
              if (product) {
                // 更新現有產品的庫存
                summary.matched++;
                for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                  if (columnIndexes[locationName] !== undefined) {
                    const quantityValue = row[columnIndexes[locationName]];
                    let quantity = 0;
                    
                    // 改進數量解析
                    if (quantityValue !== null && quantityValue !== undefined && quantityValue !== '') {
                      const numValue = parseFloat(String(quantityValue));
                      if (!isNaN(numValue) && numValue >= 0) {
                        quantity = Math.floor(numValue); // 確保是整數
                      }
                    }
                    
                    if (quantity > 0) {
                      const locationId = locationMap[locationName];
                      if (locationId) {
                        let inventory = product.inventories.find((inv: any) => inv.locationId.toString() === locationId);
                        if (inventory) {
                          inventory.quantity += quantity;
                        } else {
                          product.inventories.push({
                            locationId: new mongoose.Types.ObjectId(locationId),
                            quantity: quantity
                          });
                        }
                      }
                    }
                  }
                }
                await product.save();
                summary.updated++;
              } else {
                // 創建新產品 - 添加重複檢查
                // 再次檢查是否真的不存在（防止並發問題）
                const existingProduct = await Product.findOne({
                  productCode: cleanProductCode
                });
                
                if (existingProduct) {
                  // 如果存在，更新現有產品
                  summary.matched++;
                  for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                    if (columnIndexes[locationName] !== undefined) {
                      const quantityValue = row[columnIndexes[locationName]];
                      let quantity = 0;
                      
                      // 改進數量解析
                      if (quantityValue !== null && quantityValue !== undefined && quantityValue !== '') {
                        const numValue = parseFloat(String(quantityValue));
                        if (!isNaN(numValue) && numValue >= 0) {
                          quantity = Math.floor(numValue); // 確保是整數
                        }
                      }
                      
                      if (quantity > 0) {
                        const locationId = locationMap[locationName];
                        if (locationId) {
                          let inventory = existingProduct.inventories.find((inv: any) => inv.locationId.toString() === locationId);
                          if (inventory) {
                            inventory.quantity += quantity;
                          } else {
                            existingProduct.inventories.push({
                              locationId: new mongoose.Types.ObjectId(locationId),
                              quantity: quantity
                            });
                          }
                        }
                      }
                    }
                  }
                  await existingProduct.save();
                  summary.updated++;
                } else {
                  // 創建新產品
                  summary.created++;
                  
                  // 確定產品類型 - 改進推測邏輯
                  let productType = '其他';
                  const nameLower = cleanProductName.toLowerCase();
                  if (nameLower.includes('保暖') || nameLower.includes('防寒') || nameLower.includes('羽絨')) {
                    productType = '保暖衣';
                  } else if (nameLower.includes('抓毛') || nameLower.includes('fleece')) {
                    productType = '抓毛';
                  } else if (nameLower.includes('上水') || nameLower.includes('防水')) {
                    productType = '上水褸';
                  } else if (nameLower.includes('泳衣') || nameLower.includes('泳褲') || nameLower.includes('泳裝')) {
                    productType = '泳裝';
                  } else if (nameLower.includes('t恤') || nameLower.includes('t-shirt') || nameLower.includes('短袖')) {
                    productType = 'T恤';
                  }
                  
                  // 收集各門市的庫存
                  const inventories = [];
                  for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                    if (columnIndexes[locationName] !== undefined) {
                      const quantityValue = row[columnIndexes[locationName]];
                      let quantity = 0;
                      
                      // 改進數量解析
                      if (quantityValue !== null && quantityValue !== undefined && quantityValue !== '') {
                        const numValue = parseFloat(String(quantityValue));
                        if (!isNaN(numValue) && numValue >= 0) {
                          quantity = Math.floor(numValue); // 確保是整數
                        }
                      }
                      
                      if (quantity > 0) {
                        const locationId = locationMap[locationName];
                        if (locationId) {
                          inventories.push({
                            locationId: new mongoose.Types.ObjectId(locationId),
                            quantity: quantity
                          });
                        }
                      }
                    }
                  }
                  
                  // 創建新產品
                  const newProduct = new Product({
                    name: cleanProductName,
                    productCode: cleanProductCode,
                    productType: productType,
                    size: cleanSize,
                    price: 0,
                    inventories: inventories
                  });
                  
                  await newProduct.save();
                  console.log(`調試: 創建新產品 - ${cleanProductName} (${cleanProductCode})`);
                }
              }
            } catch (rowError) {
              const errorMsg = `第${rowIndex+1}行處理錯誤: ${rowError}`;
              console.error('調試:', errorMsg);
              summary.errors.push(errorMsg);
            }
          }
          
          // 批次間暫停，避免阻塞
          if (end < maxRows) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      } catch (fileError) {
        const errorMsg = `文件 ${file.originalname} 處理錯誤: ${fileError}`;
        console.error('調試:', errorMsg);
        summary.errors.push(errorMsg);
      }
    }
    
    console.log('調試: Excel導入完成，結果:', summary);
    res.json(summary);
  } catch (e) {
    console.error('調試: Excel導入處理錯誤:', e);
    res.status(500).json({ message: 'Failed to import Excel', error: String(e) });
  }
});

// 清零所有商品數量功能
router.post('/clear-all', async (req, res) => {
  try {
    console.log('調試: 收到清零所有商品數量請求');
    
    const summary = { 
      processed: 0,
      updated: 0, 
      errors: [] as string[]
    };
    
    // 查找所有產品
    const allProducts = await Product.find({});
    console.log(`調試: 找到 ${allProducts.length} 個產品需要清零`);
    
    // 批量處理產品
    const batchSize = 50; // 每批處理50個產品
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      
      for (const product of batch) {
        try {
          summary.processed++;
          
          // 將所有庫存數量設為0
          product.inventories.forEach((inventory: any) => {
            inventory.quantity = 0;
          });
          
          await product.save();
          summary.updated++;
          
          console.log(`調試: 清零產品 ${product.name} (${product.productCode}) 的庫存`);
        } catch (productError) {
          const errorMsg = `產品 ${product.name} (${product.productCode}) 清零失敗: ${productError}`;
          console.error('調試:', errorMsg);
          summary.errors.push(errorMsg);
        }
      }
      
      // 批次間暫停，避免阻塞
      if (i + batchSize < allProducts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('調試: 清零完成，結果:', summary);
    res.json(summary);
  } catch (e) {
    console.error('調試: 清零處理錯誤:', e);
    res.status(500).json({ message: 'Failed to clear all products', error: String(e) });
  }
});

export default router;