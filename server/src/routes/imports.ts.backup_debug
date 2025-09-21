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

// 改進：從購買類型中提取尺寸和類型
function parsePurchaseTypeAndSize(purchaseTypeText: string): { purchaseType?: string; size?: string } {
  if (!purchaseTypeText) {
    return {};
  }
  
  // 支持格式："尺寸 | 褲子/上衣" 或 "褲子/上衣 | 尺寸"
  const patterns = [
    /(\d+)\s*[|｜]\s*(上衣|褲子|套裝)/,
    /(上衣|褲子|套裝)\s*[|｜]\s*(\d+)/,
    /(\d+)\s*(上衣|褲子|套裝)/,
    /(上衣|褲子|套裝)\s*(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = purchaseTypeText.match(pattern);
    if (match) {
      const size = match[1] || match[2];
      const type = match[2] || match[1];
      
      if (/\d+/.test(size) && /(上衣|褲子|套裝)/.test(type)) {
        return {
          purchaseType: type,
          size: size
        };
      }
    }
  }
  
  return {};
}

// 修改：WS-712系列商品的特殊匹配函數
async function updateWS712Product(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  
  console.log(`調試: 查找WS-712產品 ${rawCode}, 變體:`, variants);
  console.log(`調試: 輸入參數 - rawCode: ${rawCode}, qty: ${qty}, locationId: ${locationId}, direction: ${direction}`);
  console.log(`調試: 輸入參數 - purchaseType: ${purchaseType}, size: ${size}`);
  
  // 查找所有匹配的WS-712產品
  const products = await Product.find({ productCode: { $in: variants } });
  console.log(`調試: 找到 ${products.length} 個匹配的WS-712產品`);
  
  if (products.length === 0) { 
    console.log(`調試: 沒有找到任何WS-712產品`);
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  
  // 如果沒有指定購買類型和尺寸，使用原來的邏輯
  if (!purchaseType && !size) {
    console.log(`調試: 沒有購買類型和尺寸，使用第一個匹配的產品`);
    const product = products[0]; // 取第一個匹配的產品
    console.log(`調試: 選擇產品 - _id: ${product._id}, sizes:`, product.sizes);
    
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    console.log(`調試: 查找庫存 - locationId: ${locationId}, 找到庫存:`, inv ? `數量: ${inv.quantity}` : '無');
    
    if (inv) {
      const oldQuantity = inv.quantity;
      inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
      console.log(`調試: 更新庫存 - 舊數量: ${oldQuantity}, 新數量: ${inv.quantity}, 變化: ${direction === 'out' ? '-' : '+'}${qty}`);
    } else {
      const newQuantity = direction === 'out' ? 0 : qty;
      product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: newQuantity });
      console.log(`調試: 新增庫存 - locationId: ${locationId}, 數量: ${newQuantity}`);
    }
    
    await product.save();
    console.log(`調試: 產品保存成功`);
    summary.updated++;
    return;
  }
  
  // 只有尺寸，沒有購買類型 - 根據尺寸匹配
  if (size && !purchaseType) {
    console.log(`調試: 只有尺寸 ${size}，沒有購買類型，根據尺寸匹配產品`);
    let matchedProduct = null;
    
    for (const product of products) {
      console.log(`調試: 檢查產品 ${product.productCode}, 尺寸:`, product.sizes);
      
      const hasMatchingSize = product.sizes.some(productSize => {
        const sizeStr = productSize.replace(/[{}]/g, '');
        const parts = sizeStr.split('|').map(p => p.trim());
        console.log(`調試: 檢查尺寸 "${productSize}" -> "${sizeStr}" -> parts:`, parts);
        
        const hasSize = parts.some(part => part.includes(size));
        console.log(`調試: 包含尺寸 ${size}: ${hasSize}`);
        
        return hasSize;
      });
      
      if (hasMatchingSize) {
        matchedProduct = product;
        console.log(`調試: 找到匹配尺寸的產品: ${product.productCode}, _id: ${product._id}, sizes:`, product.sizes);
        break;
      }
    }
    
    if (!matchedProduct) {
      console.log(`調試: 沒有找到匹配尺寸的產品`);
      summary.notFound.push(`${normalizeCode(rawCode)} (尺寸: ${size})`);
      return;
    }
    
    console.log(`調試: 開始更新庫存 - 產品: ${matchedProduct.productCode}, _id: ${matchedProduct._id}`);
    summary.matched++;
    const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
    console.log(`調試: 查找庫存 - locationId: ${locationId}, 找到庫存:`, inv ? `數量: ${inv.quantity}` : '無');
    
    if (inv) {
      const oldQuantity = inv.quantity;
      inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
      console.log(`調試: 更新庫存 - 舊數量: ${oldQuantity}, 新數量: ${inv.quantity}, 變化: ${direction === 'out' ? '-' : '+'}${qty}`);
    } else {
      const newQuantity = direction === 'out' ? 0 : qty;
      matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: newQuantity });
      console.log(`調試: 新增庫存 - locationId: ${locationId}, 數量: ${newQuantity}`);
    }
    
    await matchedProduct.save();
    console.log(`調試: 產品保存成功`);
    summary.updated++;
    return;
  }
  
  // 有購買類型和尺寸 - 精確匹配
  console.log(`調試: 查找匹配的尺寸 - 購買類型: ${purchaseType}, 尺寸: ${size}`);
  
  let matchedProduct = null;
  for (const product of products) {
    console.log(`調試: 檢查產品 ${product.productCode}, 尺寸:`, product.sizes);
    
    // 檢查產品的尺寸是否匹配
    const hasMatchingSize = product.sizes.some(productSize => {
      // 支持兩種格式：{上衣 | 1} 和 {1 | 上衣}
      const sizeStr = productSize.replace(/[{}]/g, ''); // 移除大括號
      const parts = sizeStr.split('|').map(p => p.trim());
      
      console.log(`調試: 檢查尺寸 "${productSize}" -> "${sizeStr}" -> parts:`, parts);
      
      // 檢查是否包含購買類型和尺寸
      const hasPurchaseType = parts.some(part => part.includes(purchaseType || ''));
      const hasSize = parts.some(part => part.includes(size || ''));
      
      console.log(`調試: 包含購買類型: ${hasPurchaseType}, 包含尺寸: ${hasSize}`);
      
      return hasPurchaseType && hasSize;
    });
    
    if (hasMatchingSize) {
      matchedProduct = product;
      console.log(`調試: 找到匹配的產品: ${product.productCode}, _id: ${product._id}`);
      break;
    }
  }
  
  if (!matchedProduct) {
    console.log(`調試: 沒有找到匹配的產品`);
    summary.notFound.push(`${normalizeCode(rawCode)} (${purchaseType}, 尺寸: ${size})`);
    return;
  }
  
  console.log(`調試: 開始更新庫存 - 產品: ${matchedProduct.productCode}, _id: ${matchedProduct._id}`);
  summary.matched++;
  const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
  console.log(`調試: 查找庫存 - locationId: ${locationId}, 找到庫存:`, inv ? `數量: ${inv.quantity}` : '無');
  
  if (inv) {
    const oldQuantity = inv.quantity;
    inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    console.log(`調試: 更新庫存 - 舊數量: ${oldQuantity}, 新數量: ${inv.quantity}, 變化: ${direction === 'out' ? '-' : '+'}${qty}`);
  } else {
    const newQuantity = direction === 'out' ? 0 : qty;
    matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: newQuantity });
    console.log(`調試: 新增庫存 - locationId: ${locationId}, 數量: ${newQuantity}`);
  }
  
  await matchedProduct.save();
  console.log(`調試: 產品保存成功`);
  summary.updated++;
}

// 新增：處理有尺寸但沒有購買類型的商品（如WS-793BU）
async function updateProductWithSize(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', size?: string) {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  
  console.log(`調試: 查找產品 ${rawCode} (有尺寸但無購買類型), 變體:`, variants);
  
  // 查找所有匹配的產品
  const products = await Product.find({ productCode: { $in: variants } });
  console.log(`調試: 找到 ${products.length} 個匹配的產品`);
  
  if (products.length === 0) { 
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  
  // 如果有尺寸信息，嘗試匹配尺寸
  if (size) {
    console.log(`調試: 查找匹配的尺寸 - 尺寸: ${size}`);
    
    let matchedProduct = null;
    for (const product of products) {
      console.log(`調試: 檢查產品 ${product.productCode}, 尺寸:`, product.sizes);
      
      // 檢查產品的尺寸是否匹配
      const hasMatchingSize = product.sizes.some(productSize => {
        const sizeStr = productSize.replace(/[{}]/g, ''); // 移除大括號
        const parts = sizeStr.split('|').map(p => p.trim());
        
        console.log(`調試: 檢查尺寸 "${productSize}" -> "${sizeStr}" -> parts:`, parts);
        
        // 檢查是否包含尺寸
        const hasSize = parts.some(part => part.includes(size));
        
        console.log(`調試: 包含尺寸: ${hasSize}`);
        
        return hasSize;
      });
      
      if (hasMatchingSize) {
        matchedProduct = product;
        console.log(`調試: 找到匹配的產品: ${product.productCode}`);
        break;
      }
    }
    
    if (matchedProduct) {
      summary.matched++;
      const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
      if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
      else matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
      await matchedProduct.save();
      summary.updated++;
      return;
    }
  }
  
  // 如果沒有尺寸匹配，使用第一個匹配的產品
  console.log(`調試: 沒有尺寸匹配，使用第一個匹配的產品`);
  const product = products[0];
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

// 修改：更新函數調用
async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  // 檢查是否為WS-712系列商品
  if (rawCode.includes('WS-712')) {
    await updateWS712Product(rawCode, qty, locationId, summary, direction, purchaseType, size);
    return;
  }
  
  // 其他商品：如果有尺寸信息，使用尺寸匹配邏輯
  if (size) {
    await updateProductWithSize(rawCode, qty, locationId, summary, direction, size);
    return;
  }
  
  // 其他商品使用原來的邏輯（沒有尺寸信息）
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

// 改進：PDF解析函數，使用pdf-parse作為主要方法
async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number; purchaseType?: string; size?: string }[]> {
  const rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
  
  try {
    // 使用pdf-parse作為主要解析方法
    const data = await pdf(buffer);
    const text = data.text;
    
    console.log(`調試: 使用pdf-parse解析，文本長度: ${text.length}`);
    
    if (text) {
      const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
      console.log(`調試: 總共 ${lines.length} 行文本`);
      
      // 處理每一行，查找商品信息
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 查找商品代碼 - 優先查找WS-開頭的商品
        const wsCodeMatch = line.match(/(WS-\w+)/);
        if (wsCodeMatch) {
          const code = wsCodeMatch[1];
          console.log(`調試: 找到商品代碼: ${code}`);
          
          // 查找數量 - 在商品代碼行中查找數量
          let qty = 1; // 默認數量為1
          const qtyMatch = line.match(/(\d+)HK\$/);
          if (qtyMatch) {
            // 如果找到價格，數量通常是1
            qty = 1;
          }
          
          // 查找尺寸和購買類型 - 在後續行中查找
          let size: string | undefined;
          let purchaseType: string | undefined;
          
          // 檢查後續幾行
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j];
            console.log(`調試: 檢查行 ${j + 1}: "${nextLine}"`);
            
            // 先查找數量 - 查找純數字行
            const qtyInLine = nextLine.match(/^\s*\d+\s*$/);
            if (qtyInLine) {
              qty = parseInt(qtyInLine[0].trim(), 10);
              console.log(`調試: 找到實際數量: ${qty}`);
            }
            
            // 查找尺寸 - 使用經過驗證的正則表達式
            const sizePatterns = [
              /- 尺寸[：:]\s*([^，,\s\n]+)/,
              /尺寸[：:]\s*([^，,\s\n]+)/
            ];
            
            for (const pattern of sizePatterns) {
              const sizeMatch = nextLine.match(pattern);
              if (sizeMatch) {
                size = sizeMatch[1];
                console.log(`調試: 找到尺寸: ${size} (使用模式: ${pattern})`);
                break;
              }
            }
            
            // 查找購買類型 - 使用經過驗證的正則表達式
            const purchaseTypePatterns = [
              /- 購買類型[：:]\s*([^，,\s\n]+)/,
              /購買類型[：:]\s*([^，,\s\n]+)/
            ];
            
            for (const pattern of purchaseTypePatterns) {
              const purchaseTypeMatch = nextLine.match(pattern);
              if (purchaseTypeMatch) {
                purchaseType = purchaseTypeMatch[1];
                console.log(`調試: 找到購買類型: ${purchaseType} (使用模式: ${pattern})`);
                break;
              }
            }
            
            // 如果遇到下一個商品代碼，停止搜索
            if (nextLine.match(/(WS-\w+)/)) {
              break;
            }
          }
          
          rows.push({
            name: '',
            code: code,
            qty: qty,
            purchaseType: purchaseType,
            size: size
          });
          
          console.log(`調試: 添加商品 - 代碼: ${code}, 數量: ${qty}, 尺寸: ${size}, 購買類型: ${purchaseType}`);
        }
      }
    }
  } catch (error) {
    console.error('pdf-parse解析失敗:', error);
  }
  
  console.log(`調試: 總共提取到 ${rows.length} 個商品`);
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
          console.log('PDF解析失敗:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
          const text = data.text;
          if (text) {
            const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              const m = lines[i].match(codePattern);
              if (m) {
                const qtyMatch = lines[i].match(/\b([1-9]\d{0,2})\b/);
                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                if (qty > 0) {
                  rows.push({ name: '', code: m[0], qty, purchaseType: undefined, size: undefined });
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
          console.log('PDF解析失敗:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
          const text = data.text;
          if (text) {
            const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              const m = lines[i].match(codePattern);
              if (m) {
                const qtyMatch = lines[i].match(/\b([1-9]\d{0,2})\b/);
                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                if (qty > 0) {
                  rows.push({ name: '', code: m[0], qty, purchaseType: undefined, size: undefined });
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

// Excel導入功能 - 使用备份代码的完善逻辑
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
        // 讀取Excel文件 - 使用数组格式
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (data.length < 2) {
          summary.errors.push(`文件 ${file.originalname}: 數據行數不足`);
          continue;
        }
        
        // 獲取標題行（第一行）
        const headers = data[0] as string[];
        console.log('調試: Excel標題行:', headers);
        
        // 根據第一行內容判斷列類型
        const columnIndexes: Record<string, number> = {};
        const columnMappings: Record<string, string[]> = {
          'productCode': ['編號', '型號', '產品編號', '貨號', 'SKU', '產品代碼', '代碼', '編碼'],
          'productName': ['產品', '商品詳情', '商品名稱', '產品名稱', '名稱', '商品', '品名'],
          'size': ['尺寸', '商品選項', '規格', '選項', '尺碼', '大小'],
          '觀塘': ['觀塘', '觀塘店', '觀塘門市', '觀塘倉', '觀塘庫存'],
          '灣仔': ['灣仔', '灣仔店', '灣仔門市', '灣仔倉', '灣仔庫存'],
          '荔枝角': ['荔枝角', '荔枝角店', '荔枝角門市', '荔枝角倉', '荔枝角庫存'],
          '元朗': ['元朗', '元朗店', '元朗門市', '元朗倉', '元朗庫存'],
          '國内倉': ['國內倉', '國内倉', '倉庫', '總倉', '國内', '國內', '國内倉庫', '國內倉庫']
        };
        
        // 識別列索引
        for (const [columnType, variants] of Object.entries(columnMappings)) {
          let found = false;
          for (const variant of variants) {
            const index = headers.findIndex(h => h && h.toString().trim() === variant);
            if (index !== -1) {
              columnIndexes[columnType] = index;
              found = true;
              console.log(`調試: 找到列 "${columnType}" 對應 "${variant}" 在索引 ${index}`);
              break;
            }
          }
          if (!found && ['productCode', 'productName', 'size'].includes(columnType)) {
            summary.errors.push(`文件 ${file.originalname}: 缺少必需列 "${columnType}" (支持的變體: ${variants.join(', ')})`);
          }
        }
        
        // 檢查必需的列是否存在
        if (columnIndexes.productCode === undefined || columnIndexes.productName === undefined || columnIndexes.size === undefined) {
          console.log('調試: 缺少必需列');
          continue;
        }
        
        // 獲取門市ID映射
        const locations = await Location.find({});
        const locationMap: Record<string, string> = {};
        locations.forEach((loc: any) => {
          locationMap[loc.name] = loc._id.toString();
        });
        
        // 從第二行開始處理數據
        for (let i = 1; i < data.length; i++) {
          const row = data[i] as any[];
          if (!row || row.length === 0) continue;
          
          try {
            // 提取基本產品信息
            const productCode = row[columnIndexes.productCode]?.toString().trim();
            const productName = row[columnIndexes.productName]?.toString().trim();
            const size = row[columnIndexes.size]?.toString().trim();
            
            if (!productCode || !productName || !size) {
              summary.errors.push(`第${i+1}行: 編號、產品名稱或尺寸為空`);
              continue;
            }
            
            summary.processed++;
            
            // 查找現有產品
            let product = await Product.findOne({
              name: productName,
              productCode: productCode,
              $or: [
                { size: size },
                { sizes: { $in: [size] } }
              ]
            });
            
            if (product) {
              // 更新現有產品的庫存
              summary.matched++;
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantity = parseInt(row[columnIndexes[locationName]]?.toString() || '0', 10);
                  if (quantity > 0) {
                    const locationId = locationMap[locationName];
                    if (locationId) {
                      let inventory = product.inventories.find((inv: any) => inv.locationId.toString() === locationId);
                      if (inventory) {
                        inventory.quantity += quantity; // 累加模式
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
              // 創建新產品
              summary.created++;
              
              // 確定產品類型（基於名稱推測）
              let productType = '其他';
              if (productName.includes('保暖') || productName.includes('防寒')) {
                productType = '保暖衣';
              } else if (productName.includes('抓毛')) {
                productType = '抓毛';
              } else if (productName.includes('上水')) {
                productType = '上水褸';
              }
              
              // 收集各門市的庫存
              const inventories = [];
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantity = parseInt(row[columnIndexes[locationName]]?.toString() || '0', 10);
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
                name: productName,
                productCode: productCode,
                productType: productType,
                size: size, // 使用單一尺寸格式
                price: 0, // 默認價格
                inventories: inventories
              });
              
              await newProduct.save();
            }
          } catch (rowError) {
            summary.errors.push(`第${i+1}行處理錯誤: ${rowError}`);
          }
        }
      } catch (fileError) {
        summary.errors.push(`文件 ${file.originalname} 處理錯誤: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('調試: Excel導入處理錯誤:', e);
    res.status(500).json({ message: 'Failed to import Excel', error: String(e) });
  }
});

// 清零功能 - 支持清零所有地点或指定地点
router.post('/clear', async (req, res) => {
  try {
    console.log('調試: 收到清零請求');
    const { locationId } = req.body;
    console.log('調試: locationId =', locationId);
    
    const products = await Product.find();
    let updatedCount = 0;
    const summary = { 
      processed: products.length,
      updated: 0, 
      errors: [] as string[]
    };
    
    for (const product of products) {
      try {
        let hasUpdate = false;
        
        if (locationId) {
          // 清零指定门市
          const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
          if (inv && inv.quantity > 0) {
            inv.quantity = 0;
            hasUpdate = true;
          }
        } else {
          // 清零所有门市
          product.inventories.forEach(inv => {
            if (inv.quantity > 0) {
              inv.quantity = 0;
              hasUpdate = true;
            }
          });
        }
        
        if (hasUpdate) {
          await product.save();
          summary.updated++;
        }
      } catch (productError) {
        const errorMsg = `產品 ${product.name} (${product.productCode}) 清零失敗: ${productError}`;
        console.error('調試:', errorMsg);
        summary.errors.push(errorMsg);
      }
    }
    
    console.log('調試: 清零完成，更新了', summary.updated, '個產品');
    res.json(summary);
  } catch (error) {
    console.error('清零錯誤:', error);
    res.status(500).json({ 
      message: '清零失敗', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});


// 清零功能別名（向後兼容）
router.post('/clear-all', async (req, res) => {
  try {
    console.log('調試: 收到清零請求 (clear-all端點)');
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

