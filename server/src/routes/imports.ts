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
  return (s || '').replace(/[]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  if (!n) return [];
  const variants = [n];
  if (n.includes('-')) {
    variants.push(n.replace(/-/g, ''));
    variants.push(n.replace(/-/g, ''));
    variants.push(n.replace(/-/g, ''));
  }
  return [...new Set(variants)];
}

const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}(?:[A-Z]+)?(?:\/[A-Z]+)?)|(?:\b\d{8,14}\b)/;

// 改進：更精確的購買類型和尺寸提取函數
function extractPurchaseTypeAndSize(text: string): { purchaseType?: string; size?: string } {
  // 更精確的購買類型匹配模式
  const purchaseTypePatterns = [
    /購買類型[：:]\s*([^，,\s]+)/,
    /類型[：:]\s*([^，,\s]+)/,
    /(上衣|褲子|套裝)/,
    /(Top|Bottom|Set)/i,
    // 新增：從商品名稱中提取購買類型
    /(上衣|褲子|套裝).*?(\d+)/,
    /(\d+).*?(上衣|褲子|套裝)/
  ];
  
  // 更精確的尺寸匹配模式
  const sizePatterns = [
    /尺寸[：:]\s*([^，,\s]+)/,
    /尺碼[：:]\s*([^，,\s]+)/,
    /Size[：:]\s*([^，,\s]+)/i,
    // 新增：匹配常見的尺寸格式（避免匹配訂單號等大數字）
    /\b(0|1|2|3|4|5|6|7|8|9|10|11|12|14|16|18|20|22|24|26|28|30|32|34|36|38|40|42|44|46|48|50|52|54|56|58|60|62|64|66|68|70|72|74|76|78|80|82|84|86|88|90|92|94|96|98|100|102|104|106|108|110|112|114|116|118|120|122|124|126|128|130|132|134|136|138|140|142|144|146|148|150|152|154|156|158|160|162|164|166|168|170|172|174|176|178|180|182|184|186|188|190|192|194|196|198|200)\b/
  ];
  
  let purchaseType: string | undefined;
  let size: string | undefined;
  
  // 提取購買類型
  for (const pattern of purchaseTypePatterns) {
    const match = text.match(pattern);
    if (match) {
      const type = match[1] || match[0];
      if (type.includes('上衣') || type.toLowerCase().includes('top')) {
        purchaseType = '上衣';
        break;
      }
      if (type.includes('褲子') || type.toLowerCase().includes('bottom')) {
        purchaseType = '褲子';
        break;
      }
      if (type.includes('套裝') || type.toLowerCase().includes('set')) {
        purchaseType = '套裝';
        break;
      }
    }
  }
  
  // 提取尺寸
  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      size = match[1];
      break;
    }
  }
  
  return { purchaseType, size };
}

// 改進：更精確的數量提取函數
function extractQuantity(text: string): number {
  // 避免匹配訂單號、尺寸等大數字，只匹配合理的商品數量
  const quantityPatterns = [
    // 匹配數量欄位中的數字（通常較小）
    /數量[：:]\s*(\d{1,3})/,
    /數目[：:]\s*(\d{1,3})/,
    /總共數量[：:]\s*(\d{1,3})/,
    /庫存數量[：:]\s*(\d{1,3})/,
    // 匹配合理的商品數量範圍（1-999）
    /\b([1-9]\d{0,2})\b/
  ];
  
  for (const pattern of quantityPatterns) {
    const match = text.match(pattern);
    if (match) {
      const qty = parseInt(match[1], 10);
      // 只接受合理的商品數量範圍
      if (qty > 0 && qty <= 999) {
        return qty;
      }
    }
  }
  
  return 0;
}

// 修改：WS-712系列商品的特殊匹配函數
async function updateWS712Product(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  
  // 查找所有匹配的WS-712產品
  const products = await Product.find({ productCode: { $in: variants } });
  if (products.length === 0) { 
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  
  // 如果沒有指定購買類型和尺寸，使用原來的邏輯
  if (!purchaseType || !size) {
    const product = products[0]; // 取第一個匹配的產品
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await product.save();
    summary.updated++;
    return;
  }
  
  // 根據購買類型和尺寸匹配產品
  let matchedProduct = null;
  for (const product of products) {
    // 檢查產品的尺寸是否匹配
    const hasMatchingSize = product.sizes.some(productSize => {
      // 支持兩種格式：{上衣 | 1} 和 {1 | 上衣}
      const sizeStr = productSize.replace(/[{}]/g, ''); // 移除大括號
      const parts = sizeStr.split('|').map(p => p.trim());
      
      // 檢查是否包含購買類型和尺寸
      const hasPurchaseType = parts.some(part => part.includes(purchaseType));
      const hasSize = parts.some(part => part.includes(size));
      
      return hasPurchaseType && hasSize;
    });
    
    if (hasMatchingSize) {
      matchedProduct = product;
      break;
    }
  }
  
  if (!matchedProduct) {
    summary.notFound.push(`${normalizeCode(rawCode)} (${purchaseType}, 尺寸: ${size})`);
    return;
  }
  
  summary.matched++;
  const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await matchedProduct.save();
  summary.updated++;
}

// 修改：更新函數調用
async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  // 檢查是否為WS-712系列商品
  if (rawCode.includes('WS-712')) {
    await updateWS712Product(rawCode, qty, locationId, summary, direction, purchaseType, size);
    return;
  }
  
  // 其他商品使用原來的邏輯
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

// 改進：PDF解析函數，支持更精確的數量提取
async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number; purchaseType?: string; size?: string }[]> {
  const loadingTask = getDocument({
    data: buffer,
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  
  const doc = await loadingTask.promise;
  const rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
  
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lines = textContent.items as any[];
    
    // 按Y坐標分組文本項目
    const lineGroups: any[][] = [];
    let currentLine: any[] = [];
    let currentY = 0;
    
    for (const item of lines) {
      if (Math.abs(item.transform[5] - currentY) > 5) {
        if (currentLine.length > 0) {
          lineGroups.push(currentLine);
        }
        currentLine = [item];
        currentY = item.transform[5];
      } else {
        currentLine.push(item);
      }
    }
    if (currentLine.length > 0) {
      lineGroups.push(currentLine);
    }
    
    // 查找表頭
    let nameX: [number, number] | null = null;
    let codeX: [number, number] | null = null;
    let qtyX: [number, number] | null = null;
    
    for (const line of lineGroups) {
      const lineText = line.map((t: any) => t.str).join('').trim();
      if (lineText.includes('商品') || lineText.includes('產品') || lineText.includes('品名')) {
        const nameHead = line.find((t: any) => t.str.includes('商品') || t.str.includes('產品') || t.str.includes('品名'));
        const codeHead = line.find((t: any) => t.str.includes('編號') || t.str.includes('型號') || t.str.includes('代碼'));
        const qtyHead = line.find((t: any) => t.str.includes('數量') || t.str.includes('數目') || t.str.includes('總共數量'));
        
        if (nameHead && qtyHead) {
          nameX = [nameHead.x - 2, (codeHead ? codeHead.x : qtyHead.x) - 2];
          codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null as any;
          // 放寬數量欄寬，避免長數字被截斷
          qtyX = [qtyHead.x - 2, qtyHead.x + 260];
        }
        break;
      }
    }

    if (!nameX || !qtyX) continue;

    const headerIndex = lineGroups.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(商品詳情|產品描述|商品描述|商品名稱|品名)/.test(t) && /(數量|數目|總共數量|庫存數量)/.test(t);
    });
    
    for (let i = headerIndex + 1; i < lineGroups.length; i++) {
      const L = lineGroups[i].slice().sort(byX);
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
      
      // 使用改進的數量提取函數
      const qty = extractQuantity(qtyText);
      
      if (codeMatch && qty > 0) {
        // 提取購買類型和尺寸
        const { purchaseType, size } = extractPurchaseTypeAndSize(lineText);
        rows.push({ name, code: codeMatch[0], qty, purchaseType, size });
      }
    }
  }

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

// 輔助函數
function byY(a: any, b: any) { return b.transform[5] - a.transform[5]; }
function byX(a: any, b: any) { return a.transform[4] - b.transform[4]; }

// 進貨功能
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到進貨請求');
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('調試: locationId =', locationId);
    console.log('調試: 收到文件數量 =', files?.length || 0);
    
    if (!locationId) {
      return res.status(400).json({ message: 'locationId required' });
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
        let rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
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
              if (m) {
                const qty = extractQuantity(lines[i]);
                if (qty > 0) {
                  const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                  rows.push({ name: '', code: m[0], qty, purchaseType, size });
                }
              }
            }
          }
        }
        
        summary.parsed.push(...rows);
        summary.processed += rows.length;
        
        for (const row of rows) {
          await updateByCodeVariants(row.code, row.qty, locationId, summary, 'in', row.purchaseType, row.size);
        }
      } catch (error) {
        console.error('處理文件時出錯:', error);
        summary.errors.push(`文件處理錯誤: ${error}`);
      }
    }
    
    console.log('調試: 處理完成，摘要:', summary);
    
    // 返回更新後的產品列表
    const products = await Product.find().populate('inventories.locationId');
    res.json({ message: '進貨處理完成', summary, products });
  } catch (error) {
    console.error('進貨處理錯誤:', error);
    res.status(500).json({ 
      message: '進貨處理失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// 出貨功能
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到出貨請求');
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('調試: locationId =', locationId);
    console.log('調試: 收到文件數量 =', files?.length || 0);
    
    if (!locationId) {
      return res.status(400).json({ message: 'locationId required' });
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
        let rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
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
              if (m) {
                const qty = extractQuantity(lines[i]);
                if (qty > 0) {
                  const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                  rows.push({ name: '', code: m[0], qty, purchaseType, size });
                }
              }
            }
          }
        }
        
        summary.parsed.push(...rows);
        summary.processed += rows.length;
        
        for (const row of rows) {
          await updateByCodeVariants(row.code, row.qty, locationId, summary, 'out', row.purchaseType, row.size);
        }
      } catch (error) {
        console.error('處理文件時出錯:', error);
        summary.errors.push(`文件處理錯誤: ${error}`);
      }
    }
    
    console.log('調試: 處理完成，摘要:', summary);
    
    // 返回更新後的產品列表
    const products = await Product.find().populate('inventories.locationId');
    res.json({ message: '出貨處理完成', summary, products });
  } catch (error) {
    console.error('出貨處理錯誤:', error);
    res.status(500).json({ 
      message: '出貨處理失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// 門市對調功能
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到門市對調請求');
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('調試: fromLocationId =', fromLocationId);
    console.log('調試: toLocationId =', toLocationId);
    console.log('調試: 收到文件數量 =', files?.length || 0);
    
    if (!fromLocationId || !toLocationId) {
      return res.status(400).json({ message: 'Missing fromLocationId or toLocationId' });
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
        let rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
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
              if (m) {
                const qty = extractQuantity(lines[i]);
                if (qty > 0) {
                  const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                  rows.push({ name: '', code: m[0], qty, purchaseType, size });
                }
              }
            }
          }
        }
        
        summary.parsed.push(...rows);
        summary.processed += rows.length;
        
        for (const row of rows) {
          // 從源門市減少庫存
          await updateByCodeVariants(row.code, row.qty, fromLocationId, summary, 'out', row.purchaseType, row.size);
          // 向目標門市增加庫存
          await updateByCodeVariants(row.code, row.qty, toLocationId, summary, 'in', row.purchaseType, row.size);
        }
      } catch (error) {
        console.error('處理文件時出錯:', error);
        summary.errors.push(`文件處理錯誤: ${error}`);
      }
    }
    
    console.log('調試: 處理完成，摘要:', summary);
    
    // 返回更新後的產品列表
    const products = await Product.find().populate('inventories.locationId');
    res.json({ message: '門市對調處理完成', summary, products });
  } catch (error) {
    console.error('門市對調處理錯誤:', error);
    res.status(500).json({ 
      message: '門市對調處理失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Excel導入功能
router.post('/excel', upload.single('file'), async (req, res) => {
  try {
    console.log('調試: 收到Excel導入請求');
    const { locationId } = req.body;
    const file = req.file;
    console.log('調試: locationId =', locationId);
    console.log('調試: 收到文件 =', file?.originalname);
    
    if (!locationId) {
      return res.status(400).json({ message: 'locationId required' });
    }
    
    if (!file) {
      return res.status(400).json({ message: 'Missing file' });
    }
    
    const summary = { 
      processed: 0,
      matched: 0, 
      created: 0,
      updated: 0, 
      notFound: [] as string[], 
      errors: [] as string[]
    };
    
    try {
      const workbook = XLSX.read(file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      for (const row of data as any[]) {
        const code = row['產品編號'] || row['編號'] || row['代碼'] || row['Code'] || row['code'];
        const qty = parseInt(row['數量'] || row['數目'] || row['Quantity'] || row['quantity'] || '0', 10);
        
        if (code && qty > 0) {
          summary.processed++;
          await updateByCodeVariants(code, qty, locationId, summary, 'in');
        }
      }
      
      console.log('調試: Excel處理完成，摘要:', summary);
      
      // 返回更新後的產品列表
      const products = await Product.find().populate('inventories.locationId');
      res.json({ message: 'Excel導入完成', summary, products });
    } catch (error) {
      console.error('Excel處理錯誤:', error);
      summary.errors.push(`Excel處理錯誤: ${error}`);
      res.status(500).json({ 
        message: 'Excel處理失敗', 
        error: error instanceof Error ? error.message : String(error),
        summary 
      });
    }
  } catch (error) {
    console.error('Excel導入錯誤:', error);
    res.status(500).json({ 
      message: 'Excel導入失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// 清零功能
router.post('/clear', async (req, res) => {
  try {
    console.log('調試: 收到清零請求');
    const { locationId } = req.body;
    console.log('調試: locationId =', locationId);
    
    if (!locationId) {
      return res.status(400).json({ message: 'locationId required' });
    }
    
    // 將指定門市的所有庫存設為0
    const products = await Product.find();
    let updatedCount = 0;
    
    for (const product of products) {
      const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
      if (inv && inv.quantity > 0) {
        inv.quantity = 0;
        await product.save();
        updatedCount++;
      }
    }
    
    console.log('調試: 清零完成，更新了', updatedCount, '個產品');
    
    // 返回更新後的產品列表
    const updatedProducts = await Product.find().populate('inventories.locationId');
    res.json({ 
      message: '清零完成', 
      updatedCount,
      products: updatedProducts 
    });
  } catch (error) {
    console.error('清零錯誤:', error);
    res.status(500).json({ 
      message: '清零失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
