import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import * as XLSX from 'xlsx';
import Product from '../models/Product';
import Location from '../models/Location';
import mongoose from 'mongoose';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Generate product code variants
function codeVariants(code: string): string[] {
  const variants = [code];
  
  // Remove spaces and hyphens
  const clean = code.replace(/[\s-]/g, '');
  if (clean !== code) variants.push(clean);
  
  // Add spaces between letters and numbers
  const spaced = code.replace(/([A-Za-z])(\d)/g, '$1 $2');
  if (spaced !== code) variants.push(spaced);
  
  // Add hyphens between letters and numbers
  const hyphenated = code.replace(/([A-Za-z])(\d)/g, '$1-$2');
  if (hyphenated !== code) variants.push(hyphenated);
  
  return [...new Set(variants)];
}

// Normalize product code for display
function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

// Update products by code variants
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, mode: 'in' | 'out') {
  const variants = codeVariants(code);
  let found = false;
  
  for (const variant of variants) {
    const products = await Product.find({ productCode: variant });
    
    if (products.length > 0) {
      if (!found) {
        summary.matched++; // 只在第一次找到產品時增加匹配計數
        found = true;
      }
      
      for (const product of products) {
        const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
        if (inv) {
          const oldQty = inv.quantity;
          if (mode === 'in') {
            inv.quantity += qty;
          } else {
            inv.quantity = Math.max(0, inv.quantity - qty);
          }
          await product.save();
          summary.updated++;
        } else {
          if (mode === 'in') {
            product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: qty });
            await product.save();
            summary.updated++;
          }
        }
      }
    }
  }
  
  // 如果沒有找到任何產品，添加到 notFound 數組
  if (!found) {
    summary.notFound.push(normalizeCode(code));
  }
}

// Parse PDF content and extract product codes with quantities
function parsePDFContent(content: string): Array<{ code: string; qty: number }> {
  const lines = content.split('\n');
  const results: Array<{ code: string; qty: number }> = [];
  
  // Common patterns for product codes and quantities
  const patterns = [
    // Pattern: CODE QTY or CODE-QTY or CODE: QTY
    /([A-Za-z0-9\s-]+?)\s*[-:]\s*(\d+)/g,
    // Pattern: QTY x CODE or QTY*CODE
    /(\d+)\s*[x*]\s*([A-Za-z0-9\s-]+)/g,
    // Pattern: CODE followed by number
    /([A-Za-z]+[0-9]+[A-Za-z0-9\s-]*?)\s+(\d+)/g
  ];
  
  for (const line of lines) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const code = match[1]?.trim();
        const qty = parseInt(match[2]?.trim() || '0', 10);
        
        if (code && qty > 0 && code.length >= 3) {
          results.push({ code, qty });
        }
      }
    }
  }
  
  return results;
}

// Import incoming inventory
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到進貨請求');
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('調試: locationId =', locationId);
    console.log('調試: 收到文件數量 =', files?.length || 0);
    
    if (!locationId || !files || files.length === 0) {
      console.log('調試: 缺少必要參數');
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      updated: 0, 
      notFound: [] as string[]
    };
    
    for (const file of files) {
      try {
        const data = await pdf(file.buffer);
        const rows = parsePDFContent(data.text);
        
        for (const row of rows) {
          summary.processed++;
          await updateByCodeVariants(row.code, row.qty, locationId, summary, 'in');
        }
      } catch (fileError) {
        console.error(`文件 ${file.originalname} 處理錯誤:`, fileError);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('調試: 進貨處理錯誤:', e);
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

// Import outgoing inventory
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      updated: 0, 
      notFound: [] as string[]
    };
    
    for (const file of files) {
      try {
        const data = await pdf(file.buffer);
        const rows = parsePDFContent(data.text);
        
        for (const row of rows) {
          summary.processed++;
          await updateByCodeVariants(row.code, row.qty, locationId, summary, 'out');
        }
      } catch (fileError) {
        console.error(`文件 ${file.originalname} 處理錯誤:`, fileError);
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

// Transfer inventory between locations
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!fromLocationId || !toLocationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing fromLocationId, toLocationId or files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      updated: 0, 
      notFound: [] as string[]
    };
    
    for (const file of files) {
      try {
        const data = await pdf(file.buffer);
        const rows = parsePDFContent(data.text);
        
        // Process transfers: reduce from source, increase at destination
        for (const r of rows) {
          const variants = codeVariants(r.code);
          let found = false;
          
          for (const variant of variants) {
            const products = await Product.find({ productCode: variant });
            
            if (products.length > 0) {
              found = true;
              summary.matched++; // 添加匹配計數
              
              for (const product of products) {
                const fromInv = product.inventories.find(i => String(i.locationId) === String(fromLocationId));
                const toInv = product.inventories.find(i => String(i.locationId) === String(toLocationId));
                
                // Reduce quantity from source location
                if (fromInv) {
                  fromInv.quantity = Math.max(0, fromInv.quantity - r.qty);
                }
                
                // Increase quantity at destination location
                if (toInv) {
                  toInv.quantity += r.qty;
                } else {
                  // Create new inventory entry if destination doesn't exist
                  product.inventories.push({ locationId: new mongoose.Types.ObjectId(toLocationId), quantity: r.qty });
                }
                
                await product.save();
                summary.updated++;
              }
            }
          }
          
          // 如果沒有找到任何產品，添加到 notFound 數組
          if (!found) {
            summary.notFound.push(normalizeCode(r.code));
          }
          
          summary.processed++;
        }
      } catch (fileError) {
        console.error(`文件 ${file.originalname} 處理錯誤:`, fileError);
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to transfer', error: String(e) });
  }
});

// Excel導入
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
        // 讀取Excel文件
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (data.length < 2) {
          summary.errors.push(`文件 ${file.originalname}: 數據行數不足`);
          continue;
        }
        
        // 獲取標題行
        const headers = data[0] as string[];
        console.log('調試: Excel標題行:', headers);
        
        // 檢查必需的列是否存在（支持多種列名變體）
        const columnIndexes: Record<string, number> = {};
        const columnMappings: Record<string, string[]> = {
          '商品詳情': ['商品詳情', '商品名稱', '產品名稱', '產品', '名稱', '商品'],
          '型號': ['型號', '產品編號', '編號', '貨號', 'SKU', '產品代碼'],
          '商品選項': ['商品選項', '尺寸', '規格', '選項', '尺碼'],
          '觀塘': ['觀塘', '觀塘店', '觀塘門市', '觀塘倉'],
          '灣仔': ['灣仔', '灣仔店', '灣仔門市', '灣仔倉'],
          '荔枝角': ['荔枝角', '荔枝角店', '荔枝角門市', '荔枝角倉'],
          '元朗': ['元朗', '元朗店', '元朗門市', '元朗倉'],
          '國内倉': ['國内倉', '國內倉', '倉庫', '總倉', '國内', '國內']
        };
        
        for (const [requiredCol, variants] of Object.entries(columnMappings)) {
          let found = false;
          for (const variant of variants) {
            const index = headers.findIndex(h => h && h.toString().trim() === variant);
            if (index !== -1) {
              columnIndexes[requiredCol] = index;
              found = true;
              console.log(`調試: 找到列 "${requiredCol}" 對應 "${variant}" 在索引 ${index}`);
              break;
            }
          }
          if (!found) {
            summary.errors.push(`文件 ${file.originalname}: 缺少必需列 "${requiredCol}" (支持的變體: ${variants.join(', ')})`);
          }
        }
        
        if (summary.errors.length > 0) {
          console.log('調試: 列檢查錯誤:', summary.errors);
          continue;
        }
        
        // 獲取門市ID映射
        const locations = await Location.find({});
        const locationMap: Record<string, string> = {};
        locations.forEach(loc => {
          locationMap[loc.name] = loc.id.toString();
        });
        
        // 處理數據行
        for (let i = 1; i < data.length; i++) {
          const row = data[i] as any[];
          if (!row || row.length === 0) continue;
          
          try {
            const productName = row[columnIndexes['商品詳情']]?.toString().trim();
            const productCode = row[columnIndexes['型號']]?.toString().trim();
            const size = row[columnIndexes['商品選項']]?.toString().trim();
            
            if (!productName || !productCode || !size) {
              summary.errors.push(`第${i+1}行: 商品詳情、型號或商品選項為空`);
              continue;
            }
            
            summary.processed++;
            
            // 查找現有產品
            let product = await Product.findOne({
              name: productName,
              productCode: productCode,
              size: size
            });
            
            if (product) {
              // 更新現有產品的庫存
              summary.matched++;
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                const quantity = parseInt(row[columnIndexes[locationName]]?.toString() || '0', 10);
                if (quantity > 0) {
                  const locationId = locationMap[locationName];
                  if (locationId) {
                    let inventory = product.inventories.find(inv => inv.locationId.toString() === locationId);
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
              
              const inventories = [];
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
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
              
              // 創建新產品
              const newProduct = new Product({
                name: productName,
                productCode: productCode,
                productType: productType,
                size: size,
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

export default router;