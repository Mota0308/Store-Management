// 修復後的完整 imports.ts 文件 - 支持數量累加
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Location from '../models/Location';
import pdf from 'pdf-parse';

const router = express.Router();

// 配置multer用於文件上傳
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 商品代碼變體生成函數
function codeVariants(code: string): string[] {
  const variants = [code];
  
  // 處理WS-開頭的商品代碼
  if (code.startsWith('WS-')) {
    variants.push(code.replace('WS-', 'WS'));
  } else if (code.startsWith('WS') && !code.startsWith('WS-')) {
    variants.push(code.replace('WS', 'WS-'));
  }
  
  return variants;
}

// 標準化商品代碼
function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
}

// 修改：同時提取購買類型和尺寸信息
function extractPurchaseTypeAndSize(text: string): { purchaseType?: string; size?: string } {
  // 匹配購買類型模式
  const purchaseTypePatterns = [
    /購買類型[：:]\s*([^，,\s]+)/,
    /購買[類型觊型][：:]\s*([^，,\s]+)/,
    /類型[：:]\s*([^，,\s]+)/,
    /(上衣|褲子|套裝)/,
    /(Top|Bottom|Set)/i
  ];
  
  // 匹配尺寸模式 - 只匹配明確的尺寸標識，避免誤提取產品代碼中的數字
  const sizePatterns = [
    /尺寸[：:]\s*([^，,\s]+)/,
    /尺碼[：:]\s*([^，,\s]+)/,
    /Size[：:]\s*([^，,\s]+)/i
  ];
  
  let purchaseType: string | undefined;
  let size: string | undefined;
  
  for (const pattern of purchaseTypePatterns) {
    const match = text.match(pattern);
    if (match) {
      const type = match[1] || match[0];
      // 標準化購買類型
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
  
  // 只使用明確的尺寸標識
  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      const extractedSize = match[1];
      const sizeNum = parseInt(extractedSize, 10);
      if (!isNaN(sizeNum) && sizeNum >= 0 && sizeNum <= 20) {
        size = extractedSize;
        break;
      }
    }
  }
  
  return { purchaseType, size };
}

// 修改：WS-712系列商品的特殊匹配函數
async function updateWS712Product(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  
  console.log(`調試: 處理WS-712產品 - 代碼: ${rawCode}, 數量: ${qty}, 尺寸: ${size}, 購買類型: ${purchaseType}`);
  
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
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await product.save();
    summary.updated++;
    return;
  }
  
  // 只有尺寸，沒有購買類型 - 根據尺寸匹配
  if (size && !purchaseType) {
    console.log(`調試: 只有尺寸 ${size}，沒有購買類型，根據尺寸匹配產品`);
    let matchedProduct = null;
    
    for (const product of products) {
      const hasMatchingSize = product.sizes.some(productSize => {
        const sizeStr = productSize.replace(/[{}]/g, '');
        const parts = sizeStr.split('|').map(p => p.trim());
        const hasSize = parts.some(part => part.includes(size));
        return hasSize;
      });
      
      if (hasMatchingSize) {
        matchedProduct = product;
        console.log(`調試: 找到匹配尺寸的產品: ${product.productCode}`);
        break;
      }
    }
    
    if (!matchedProduct) {
      console.log(`調試: 沒有找到匹配尺寸的產品`);
      summary.notFound.push(`${normalizeCode(rawCode)} (尺寸: ${size})`);
      return;
    }
    
    summary.matched++;
    const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await matchedProduct.save();
    summary.updated++;
    return;
  }
  
  // 有購買類型和尺寸 - 精確匹配
  console.log(`調試: 有購買類型和尺寸，進行精確匹配`);
  let matchedProduct = null;
  for (const product of products) {
    // 檢查產品的尺寸是否匹配
    const hasMatchingSize = product.sizes.some(productSize => {
      const sizeStr = productSize.replace(/[{}]/g, '');
      const parts = sizeStr.split('|').map(p => p.trim());
      
      // 精確匹配：必須同時包含購買類型和尺寸，但不考慮順序
      const hasPurchaseType = parts.some(part => part === purchaseType);
      const hasSize = parts.some(part => part === size);
      
      console.log(`調試: 檢查產品 "${product.productCode}" 尺寸 "${productSize}" -> 分割: [${parts.join(", ")}]`);
      console.log(`調試: 查找購買類型 "${purchaseType}" -> 匹配: ${hasPurchaseType}`);
      console.log(`調試: 查找尺寸 "${size}" -> 匹配: ${hasSize}`);
      
      return hasPurchaseType && hasSize;
    });
    
    if (hasMatchingSize) {
      matchedProduct = product;
      console.log(`調試: 找到精確匹配的產品: ${product.productCode}`);
      break;
    }
  }
  
  if (!matchedProduct) {
    console.log(`調試: 沒有找到精確匹配的產品`);
    summary.notFound.push(`${normalizeCode(rawCode)} (${purchaseType}, 尺寸: ${size})`);
    return;
  }
  
  // 修復後的精確匹配部分
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

// 通用更新函數
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  const variants = codeVariants(code);
  
  // 檢查是否為WS-712系列
  if (variants.some(v => v.includes('WS-712'))) {
    await updateWS712Product(code, qty, locationId, summary, direction, purchaseType, size);
    return;
  }
  
  // 其他商品的處理邏輯
  console.log(`調試: 處理其他產品 - 代碼: ${code}, 數量: ${qty}, 尺寸: ${size}, 購買類型: ${purchaseType}`);
  
  const products = await Product.find({ productCode: { $in: variants } });
  console.log(`調試: 找到 ${products.length} 個匹配的產品`);
  
  if (products.length === 0) {
    console.log(`調試: 沒有找到任何產品`);
    summary.notFound.push(normalizeCode(code));
    return;
  }
  
  // 其他產品只需要尺寸匹配
  let matchedProduct = null;
  if (size) {
    console.log(`調試: 根據尺寸 ${size} 匹配產品`);
    for (const product of products) {
      const hasMatchingSize = product.sizes.some(productSize => {
        const sizeStr = productSize.replace(/[{}]/g, '');
        const parts = sizeStr.split('|').map(p => p.trim());
        const hasSize = parts.some(part => part.includes(size));
        return hasSize;
      });
      
      if (hasMatchingSize) {
        matchedProduct = product;
        console.log(`調試: 找到匹配尺寸的產品: ${product.productCode}`);
        break;
      }
    }
    
    if (!matchedProduct) {
      console.log(`調試: 沒有找到匹配尺寸的產品`);
      summary.notFound.push(`${normalizeCode(code)} (尺寸: ${size})`);
      return;
    }
  } else {
    // 如果沒有尺寸，使用第一個匹配的產品
    console.log(`調試: 沒有尺寸，使用第一個匹配的產品`);
    matchedProduct = products[0];
  }
  
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

// 修復PDF解析函數 - 將去重機制改為數量累加機制
async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number; purchaseType?: string; size?: string }[]> {
  const productMap = new Map<string, { name: string; code: string; qty: number; purchaseType?: string; size?: string }>(); // 用於累加相同產品的數量
  
  try {
    const data = await pdf(buffer);
    const text = data.text;
    
    if (text) {
      const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        const wsCodeMatch = line.match(/(WS-\w+)/);
        if (wsCodeMatch) {
          let code = wsCodeMatch[1];
          
          // 添加調試日誌
          if (code === 'WS-793BU') {
            console.log(`調試: 第${i+1}次檢測到WS-793BU，行內容: "${line}"`);
          }
          
          // 跳過不完整的代碼
          if (code === "WS-712") {
            continue;
          }
          
          // 修復1HK後綴
          if (code.endsWith("1HK")) {
            code = code.replace("1HK", "");
          }
          
          // 查找數量
          let qty = 1;
          const qtyInSameLine = line.match(/\b([1-9]\d{0,2})\b/);
          if (qtyInSameLine) {
            const extractedQty = parseInt(qtyInSameLine[1], 10);
            if (extractedQty >= 1 && extractedQty <= 99) {
              qty = extractedQty;
            }
          }
          
          // 在後續行查找數量
          if (qty === 1) {
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              const nextLine = lines[j];
              const qtyInNextLine = nextLine.match(/^\s*([1-9]\d{0,2})\s*$/);
              if (qtyInNextLine) {
                const extractedQty = parseInt(qtyInNextLine[1], 10);
                if (extractedQty >= 1 && extractedQty <= 99) {
                  qty = extractedQty;
                  break;
                }
              }
            }
          }
          
          // 查找尺寸和購買類型 - 根據產品類型決定提取策略
          let size: string | undefined;
          let purchaseType: string | undefined;
          
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const nextLine = lines[j];
            
            // 根據產品類型決定提取策略
            if (code.includes("WS-712")) {
              // WS-712系列：提取尺寸和購買類型
              const extracted = extractPurchaseTypeAndSize(nextLine);
              if (extracted.size) {
                size = extracted.size;
              }
              if (extracted.purchaseType) {
                purchaseType = extracted.purchaseType;
              }
            } else {
              // 其他產品：只提取尺寸，不提取購買類型
              const extracted = extractPurchaseTypeAndSize(nextLine);
              if (extracted.size) {
                size = extracted.size;
              }
              // 不提取購買類型，保持為 undefined
            }
            
            // 如果遇到下一個商品代碼，停止搜索
            if (nextLine.match(/(WS-\w+)/)) {
              break;
            }
          }
          
          console.log(`調試: 提取結果 - 代碼: ${code}, 數量: ${qty}, 尺寸: ${size}, 購買類型: ${purchaseType}`);
          
          // 根據產品類型決定要求
          if (code.includes("WS-712")) {
            // WS-712系列需要尺寸+購買類型
            if (!size || !purchaseType) {
              console.log(`調試: 跳過WS-712產品 - 缺少尺寸或購買類型: ${code}`);
              continue;
            }
          } else {
            // 其他產品只需要尺寸
            if (!size) {
              console.log(`調試: 跳過產品 - 缺少尺寸: ${code}`);
              continue;
            }
          }
          
          // 創建唯一標識符 - 在size和purchaseType提取完成後
          const uniqueKey = `${code}-${size || "no-size"}-${purchaseType || "no-type"}`;
          
          // 檢查是否已經存在相同的產品組合
          if (productMap.has(uniqueKey)) {
            // 累加數量
            const existingProduct = productMap.get(uniqueKey)!;
            const oldQty = existingProduct.qty;
            existingProduct.qty += qty;
            
            if (code === 'WS-793BU') {
              console.log(`調試: WS-793BU累加 - 原數量: ${oldQty}, 新增: ${qty}, 總數: ${existingProduct.qty}`);
            }
          } else {
            // 新產品組合
            if (code === 'WS-793BU') {
              console.log(`調試: WS-793BU首次檢測 - 數量: ${qty}`);
            }
            productMap.set(uniqueKey, {
              name: "",
              code: code,
              qty: qty,
              purchaseType: purchaseType,
              size: size
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("pdf-parse解析失敗:", error);
  }
  
  // 將 Map 轉換為數組並輸出最終結果
  const rows = Array.from(productMap.values());
  console.log(`調試: 最終產品列表 (${rows.length}個產品):`);
  rows.forEach(row => {
    console.log(`調試: 最終結果 - 代碼: ${row.code}, 總數量: ${row.qty}, 尺寸: ${row.size}, 購買類型: ${row.purchaseType}`);
  });
  
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
    
    console.log(`調試: locationId = ${locationId}, 文件數量 = ${files?.length || 0}`);
    
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
    
    // 修復後的邏輯 - 確保每個文件只處理一次
    for (const file of files) {
      try {
        let rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
        
        // 先嘗試 extractByPdfjs
        try { 
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF解析失敗:', pdfjsError);
        }
        
        // 如果 extractByPdfjs 沒有結果，才使用備用方法
        if (rows.length === 0) {
          try {
            const data = await pdf(file.buffer);
            const text = data.text;
            if (text) {
              const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
              for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/(WS-\w+)/);
                if (m) {
                  const qtyMatch = lines[i].match(/\b([1-9]\d{0,2})\b/);
                  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                  if (qty > 0) {
                    rows.push({ name: '', code: m[0], qty, purchaseType: undefined, size: undefined });
                  }
                }
              }
            }
          } catch (pdfError) {
            console.log('備用PDF解析也失敗:', pdfError);
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
    
    console.log('調試: 進貨處理完成', summary);
    res.json(summary);
  } catch (error) {
    console.error('進貨處理錯誤:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

// 出貨功能
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
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
              const m = lines[i].match(/(WS-\w+)/);
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
    
    res.json(summary);
  } catch (error) {
    console.error('出貨處理錯誤:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

// Excel導入功能
router.post('/excel', upload.single('file'), async (req, res) => {
  try {
    const { locationId, direction } = req.body;
    const file = req.file;
    
    if (!locationId || !direction) {
      return res.status(400).json({ message: 'locationId and direction required' });
    }
    
    if (!file) {
      return res.status(400).json({ message: 'Missing file' });
    }
    
    // 這裡可以添加Excel解析邏輯
    // 暫時返回成功響應
    res.json({ message: 'Excel import not implemented yet' });
  } catch (error) {
    console.error('Excel導入錯誤:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

export default router;