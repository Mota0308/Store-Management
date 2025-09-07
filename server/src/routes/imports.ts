import express from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Location from '../models/Location';

const router = express.Router();

// 配置multer使用內存存儲
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB限制
});

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
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        // 使用pdf-parse解析PDF
        const data = await pdf(file.buffer);
        const text = data.text;
        
        // 提取產品信息
        const products = extractProductsFromText(text);
        
        for (const product of products) {
          summary.processed++;
          
          // 查找現有產品
          let existingProduct = await Product.findOne({
            productCode: product.code,
            $or: [
              { size: product.size },
              { sizes: { $in: [product.size] } }
            ]
          });
          
          if (existingProduct) {
            // 更新現有產品庫存
            summary.matched++;
            let inventory = existingProduct.inventories.find((inv: any) => 
              inv.locationId.toString() === locationId
            );
            
            if (inventory) {
              inventory.quantity += product.quantity;
            } else {
              existingProduct.inventories.push({
                locationId: new mongoose.Types.ObjectId(locationId),
                quantity: product.quantity
              });
            }
            
            await existingProduct.save();
            summary.updated++;
          } else {
            // 創建新產品
            summary.created++;
            const newProduct = new Product({
              name: product.name,
              productCode: product.code,
              productType: '其他',
              size: product.size,
              price: 0,
              inventories: [{
                locationId: new mongoose.Types.ObjectId(locationId),
                quantity: product.quantity
              }]
            });
            
            await newProduct.save();
          }
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
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        // 使用pdf-parse解析PDF
        const data = await pdf(file.buffer);
        const text = data.text;
        
        // 提取產品信息
        const products = extractProductsFromText(text);
        
        for (const product of products) {
          summary.processed++;
          
          // 查找現有產品
          let existingProduct = await Product.findOne({
            productCode: product.code,
            $or: [
              { size: product.size },
              { sizes: { $in: [product.size] } }
            ]
          });
          
          if (existingProduct) {
            summary.matched++;
            
            // 減少來源門市庫存
            let fromInventory = existingProduct.inventories.find((inv: any) => 
              inv.locationId.toString() === fromLocationId
            );
            
            if (fromInventory && fromInventory.quantity >= product.quantity) {
              fromInventory.quantity -= product.quantity;
              
              // 增加目標門市庫存
              let toInventory = existingProduct.inventories.find((inv: any) => 
                inv.locationId.toString() === toLocationId
              );
              
              if (toInventory) {
                toInventory.quantity += product.quantity;
              } else {
                existingProduct.inventories.push({
                  locationId: new mongoose.Types.ObjectId(toLocationId),
                  quantity: product.quantity
                });
              }
              
              await existingProduct.save();
              summary.updated++;
            } else {
              summary.errors.push(`產品 ${product.code} 尺寸 ${product.size} 在來源門市庫存不足`);
            }
          } else {
            summary.errors.push(`產品 ${product.code} 尺寸 ${product.size} 不存在`);
          }
        }
      } catch (fileError) {
        summary.errors.push(`文件 ${file.originalname} 處理錯誤: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('調試: 門市對調處理錯誤:', e);
    res.status(500).json({ message: 'Failed to process transfer', error: String(e) });
  }
});

// Excel導入功能
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
        if (!columnIndexes.productCode || !columnIndexes.productName || !columnIndexes.size) {
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

// 輔助函數：從PDF文本中提取產品信息
function extractProductsFromText(text: string): Array<{code: string, name: string, size: string, quantity: number}> {
  const products: Array<{code: string, name: string, size: string, quantity: number}> = [];
  
  // 這裡需要根據您的PDF格式來實現具體的提取邏輯
  // 暫時返回空數組，您需要根據實際PDF格式來實現
  
  return products;
}

export default router;