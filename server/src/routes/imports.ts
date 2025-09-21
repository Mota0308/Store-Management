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
    /購買類型[：:]\s*([^，,\s]+)/,
    /類型[：:]\s*([^，,\s]+)/,
    /(上衣|褲子|套裝)/,
    /(Top|Bottom|Set)/i
  ];
  
  // 匹配尺寸模式 - 改為字符串匹配
  const sizePatterns = [
    /尺寸[：:]\s*([^，,\s]+)/,
    /尺碼[：:]\s*([^，,\s]+)/,
    /Size[：:]\s*([^，,\s]+)/i,
    /\b([^\s，,\n\r]+)\b/  // 匹配字符串作為尺寸
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
  
  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      size = match[1];
      break;
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
      // 支持兩種格式：{上衣 | 1} 和 {1 | 上衣}
      const sizeStr = productSize.replace(/[{}]/g, ''); // 移除大括號
      const parts = sizeStr.split('|').map(p => p.trim());
      
      // 檢查是否包含購買類型和尺寸
      const hasPurchaseType = parts.some(part => part.includes(purchaseType || ''));
      const hasSize = parts.some(part => part.includes(size || ''));
      
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
  
  summary.matched++;
  const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await matchedProduct.save();
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
  const products = await Product.find({ productCode: { $in: variants } });
  
  if (products.length === 0) {
    summary.notFound.push(normalizeCode(code));
    return;
  }
  
  for (const product of products) {
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await product.save();
    summary.updated++;
  }
}

// 改進：PDF解析函數，根據圖片格式進行優化
async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number; purchaseType?: string; size?: string }[]> {
  const rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string }[] = [];
  
  try {
    // 使用pdf-parse作為主要解析方法
    const data = await pdf(buffer);
    const text = data.text;
    
    console.log(`調試: PDF解析開始，文本長度: ${text.length}`);
    
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
          
          // 檢查後續幾行，尋找產品描述和相關信息
          for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
            const nextLine = lines[j];
            console.log(`調試: 檢查行 ${j + 1}: "${nextLine}"`);
            
            // 先查找數量 - 查找純數字行
            const qtyInLine = nextLine.match(/^\s*\d+\s*$/);
            if (qtyInLine) {
              qty = parseInt(qtyInLine[0].trim(), 10);
              console.log(`調試: 找到實際數量: ${qty}`);
            }
            
            // 方法1：查找明確的尺寸和購買類型標籤
            // 匹配格式：- 尺寸: 1 或 - 購買類型: 上衣
            const sizeMatch = nextLine.match(/-?\s*尺寸[：:]\s*([^\s，,\n\r]+)/);
            if (sizeMatch) {
              size = sizeMatch[1].trim();
              console.log(`調試: 找到尺寸: ${size}`);
            }
            
            const purchaseTypeMatch = nextLine.match(/-?\s*購買類型[：:]\s*([^，,\s]+)/);
            if (purchaseTypeMatch) {
              const type = purchaseTypeMatch[1].trim();
              console.log(`調試: 找到購買類型: ${type}`);
              // 標準化購買類型
              if (type.includes('上衣') || type.toLowerCase().includes('top')) {
                purchaseType = '上衣';
              } else if (type.includes('褲子') || type.toLowerCase().includes('bottom')) {
                purchaseType = '褲子';
              } else if (type.includes('套裝') || type.toLowerCase().includes('set')) {
                purchaseType = '套裝';
              } else {
                purchaseType = type;
              }
              console.log(`調試: 標準化購買類型: ${purchaseType}`);
            }
            
            // 方法2：如果沒有明確標籤，嘗試從產品描述中提取
            if (!size && !purchaseType) {
              // 查找產品描述行（通常包含產品名稱）
              if (nextLine.includes('mm') || nextLine.includes('兒童') || nextLine.includes('保暖') || nextLine.includes('上衣') || nextLine.includes('褲子')) {
                // 從產品描述中提取尺寸和購買類型
                const extracted = extractPurchaseTypeAndSize(nextLine);
                if (extracted.size) {
                  size = extracted.size;
                  console.log(`調試: 從描述中提取尺寸: ${size}`);
                }
                if (extracted.purchaseType) {
                  purchaseType = extracted.purchaseType;
                  console.log(`調試: 從描述中提取購買類型: ${purchaseType}`);
                }
              }
            }
            
            // 方法3：查找套裝優惠行，可能包含尺寸信息
            if (!size && nextLine.includes('套裝優惠')) {
              const setSizeMatch = nextLine.match(/-?\s*套裝優惠.*?(\d+)/);
              if (setSizeMatch) {
                size = setSizeMatch[1].trim();
                console.log(`調試: 從套裝優惠中提取尺寸: ${size}`);
              }
            }
            
            // 如果遇到下一個商品代碼，停止搜索
            if (nextLine.match(/(WS-\w+)/)) {
              break;
            }
          }
          
          console.log(`調試: 最終結果 - 代碼: ${code}, 數量: ${qty}, 尺寸: ${size}, 購買類型: ${purchaseType}`);
          
          rows.push({
            name: '',
            code: code,
            qty: qty,
            purchaseType: purchaseType,
            size: size
          });
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