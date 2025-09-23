// 修復後的完整 imports.ts 文件 - 支持數量累加
import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Location from '../models/Location';
import pdf from 'pdf-parse';

const router = express.Router();

// 配置multer用於文件上傳
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 文件大小限制
  },
  fileFilter: (req, file, cb) => {
    // 文件格式驗證
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    const allowedExtensions = ['.pdf', '.xls', '.xlsx'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${file.originalname}. 僅支持 PDF, XLS, XLSX 格式`));
    }
  }
});

// WS-712系列代碼變體生成函數
function generateWS712Variants(code: string): string[] {
  const variants = [code];
  
  // 基本格式變換
  if (code.startsWith('WS-')) {
    variants.push(code.replace('WS-', 'WS'));
  } else if (code.startsWith('WS') && !code.startsWith('WS-')) {
    variants.push(code.replace('WS', 'WS-'));
  }
  
  // 針對WS-712的特殊處理
  if (code.includes('WS-712') || code.includes('WS712')) {
    const baseCode = 'WS-712';
    
    // 提取後綴部分 (例如: WS-712TBk06 -> TBk06, WS-712PPK08 -> PPK08)
    let suffix = '';
    if (code.includes('WS-712')) {
      suffix = code.replace('WS-712', '');
    } else if (code.includes('WS712')) {
      suffix = code.replace('WS712', '');
    }
    
    // 生成各種可能的變體
    if (suffix) {
      // 基本變體
      variants.push(baseCode + suffix);
      variants.push('WS712' + suffix);
      
      // 處理大小寫變化
      const suffixUpper = suffix.toUpperCase();
      const suffixLower = suffix.toLowerCase();
      
      variants.push(baseCode + suffixUpper);
      variants.push(baseCode + suffixLower);
      variants.push('WS712' + suffixUpper);
      variants.push('WS712' + suffixLower);
      
      // 如果後綴以數字結尾，也嘗試只用基本代碼匹配
      const baseMatch = suffix.match(/^([A-Za-z]+)/);
      if (baseMatch) {
        const letterPart = baseMatch[1];
        variants.push(baseCode + letterPart);
        variants.push('WS712' + letterPart);
        variants.push(baseCode + letterPart.toUpperCase());
        variants.push(baseCode + letterPart.toLowerCase());
      }
    } else {
      // 如果沒有後綴，只添加基本的WS-712變體
    variants.push('WS-712');
    variants.push('WS712');
    }
  }
  
  // 去重並返回
  return [...new Set(variants)];
}

// 商品代碼變體生成函數
function codeVariants(code: string): string[] {
  // 對於WS-712系列使用專門的變體生成
  if (code.includes('WS-712') || code.includes('WS712')) {
    return generateWS712Variants(code);
  }
  
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

// 修改：同時提取購買類型和尺寸信息（基于备份的成熟实现）
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

// 成熟的PDF解析函数（从备份代码移植）
async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number; purchaseType?: string; size?: string }[]> {
  const productMap = new Map<string, { name: string; code: string; qty: number; purchaseType?: string; size?: string }>(); // 用於累加相同產品的數量
  
  try {
    const data = await pdf(buffer);
    const text = data.text;
    
    if (text) {
      const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        const wsCodeMatch = line.match(/(WS-\w+|NM\d+|AEP-WS-\d+\w*)/);
        if (wsCodeMatch) {
          let code = wsCodeMatch[1];
          
          console.log(`調試: 第${i+1}行檢測到產品代碼: ${code}，行內容: "${line}"`);
          
          // 修復1HK後綴
          if (code.endsWith("1HK")) {
            code = code.replace("1HK", "");
            console.log(`調試: 修正代碼 ${wsCodeMatch[1]} -> ${code}`);
          }
          
          // 查找數量 - 避免误识别尺寸、规格中的数字
          let qty = 1;
          // 不在产品描述行中查找数量，因为容易误识别尺寸数字
          // 产品描述行通常包含产品代码，应该跳过数量提取
          console.log(`調試: 跳过产品描述行的数量提取，使用默认数量1`);
          
          // 在後續行查找數量
          if (qty === 1) {
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              const nextLine = lines[j];
              const qtyInNextLine = nextLine.match(/^\s*([1-9]\d{0,2})\s*$/);
              if (qtyInNextLine) {
                const extractedQty = parseInt(qtyInNextLine[1], 10);
                if (extractedQty >= 1 && extractedQty <= 99) {
                  qty = extractedQty;
                  console.log(`調試: 在第${j+1}行找到數量: ${qty}`);
                  break;
                }
              }
            }
          }
          
          // 查找尺寸和購買類型
          let size: string | undefined;
          let purchaseType: string | undefined;
          
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const nextLine = lines[j];
            
            const extracted = extractPurchaseTypeAndSize(nextLine);
            if (extracted.size && !size) {
              size = extracted.size;
              console.log(`調試: 找到尺寸: ${size}`);
            }
            if (extracted.purchaseType && !purchaseType) {
              purchaseType = extracted.purchaseType;
              console.log(`調試: 找到購買類型: ${purchaseType}`);
            }
            
            // 如果遇到下一個商品代碼，停止搜索
            if (nextLine.match(/(WS-\w+|NM\d+|AEP-WS-\d+\w*)/)) {
              break;
            }
          }
          
          console.log(`調試: 提取結果 - 代碼: ${code}, 數量: ${qty}, 尺寸: ${size || '无'}, 購買類型: ${purchaseType || '无'}`);
          
          // 創建唯一標識符
          const uniqueKey = `${code}-${size || "no-size"}-${purchaseType || "no-type"}`;
          
          // 檢查是否已經存在相同的產品組合
          if (productMap.has(uniqueKey)) {
            // 累加數量
            const existingProduct = productMap.get(uniqueKey)!;
            const oldQty = existingProduct.qty;
            existingProduct.qty += qty;
            console.log(`調試: ${code}累加 - 原數量: ${oldQty}, 新增: ${qty}, 總數: ${existingProduct.qty}`);
          } else {
            // 新產品組合
            console.log(`調試: ${code}首次檢測 - 數量: ${qty}`);
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
    console.log(`調試: 最終結果 - 代碼: ${row.code}, 總數量: ${row.qty}, 尺寸: ${row.size || '无'}, 購買類型: ${row.purchaseType || '无'}`);
  });
  
  return rows;
}

// 已删除旧的extractPurchaseTypeAndSizeOld函数

// 修改：WS-712系列商品的特殊匹配函數
async function updateWS712Product(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string) {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  
  const products = await Product.find({ productCode: { $in: variants } });
  
  if (products.length === 0) { 
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  
  let matchedProduct = null;
  
  // 根據尺寸匹配（WS-712主要按尺寸區分）
  if (size) {
    for (const product of products) {
      if (product.sizes && product.sizes.includes(size)) {
        matchedProduct = product;
        break;
      }
    }
  }
  
  // 如果沒有找到匹配的，使用第一個產品
  if (!matchedProduct) {
    matchedProduct = products[0];
  }
  
  // 更新庫存
  summary.matched++;
  const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
  
  if (inv) {
    inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  } else {
    const newQuantity = direction === 'out' ? 0 : qty;
    matchedProduct.inventories.push({ 
      locationId: new mongoose.Types.ObjectId(locationId), 
      quantity: newQuantity 
    });
  }

  await matchedProduct.save();
  summary.updated++;
}

// 通用更新函數
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in', purchaseType?: string, size?: string, originalSize?: string, originalPurchaseType?: string) {
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
  
  // 其他產品的尺寸匹配（支持组合尺寸格式）
  let matchedProduct = null;
  if (size) {
    console.log(`調試: 根據尺寸 "${size}" 匹配產品`);
    
    // 创建所有可能的尺寸匹配格式
    const sizesToMatch = [size];
    if (originalSize && originalPurchaseType) {
      // 添加两种组合格式的可能性
      sizesToMatch.push(`${originalSize} | ${originalPurchaseType}`);
      sizesToMatch.push(`${originalPurchaseType} | ${originalSize}`);
      // 也尝试单独的原始值
      sizesToMatch.push(originalSize);
      sizesToMatch.push(originalPurchaseType);
    }
    
    console.log(`調試: 嘗試匹配的尺寸格式: [${sizesToMatch.join(', ')}]`);
    
    for (const product of products) {
      if (product.sizes) {
        for (const sizeToMatch of sizesToMatch) {
          if (product.sizes.includes(sizeToMatch)) {
            matchedProduct = product;
            console.log(`調試: 成功匹配尺寸 "${sizeToMatch}" 在產品 ${product.productCode}`);
            break;
          }
        }
        if (matchedProduct) break;
      }
    }
    
    if (!matchedProduct) {
      summary.notFound.push(`${normalizeCode(code)} (尺寸: ${size})`);
      console.log(`調試: 未找到匹配的尺寸，嘗試的格式: [${sizesToMatch.join(', ')}]`);
      return;
    }
  } else {
    // 如果沒有尺寸，使用第一個匹配的產品
    matchedProduct = products[0];
  }
  
  summary.matched++;
  const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));

  if (inv) {
    inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  } else {
    const newQuantity = direction === 'out' ? 0 : qty;
    matchedProduct.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: newQuantity });
  }

  await matchedProduct.save();
  summary.updated++;
}

// 輔助函數
function byY(a: any, b: any) { return b.transform[5] - a.transform[5]; }

// 已删除错误的parseProductTableRow函数，使用成熟的extractByPdfjs替代

// 已删除错误的parseTableColumnStructure函数，使用成熟的extractByPdfjs替代
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
        
        // 使用成熟的PDF解析器
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
        let rows: { name: string; code: string; qty: number; purchaseType?: string; size?: string; originalSize?: string; originalPurchaseType?: string }[] = [];
        try { 
          // 使用成熟的PDF解析器
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF解析失敗:', pdfjsError);
          summary.errors.push(`PDF解析失败: ${pdfjsError instanceof Error ? pdfjsError.message : String(pdfjsError)}`);
        }
        
        summary.parsed.push(...rows);
        summary.processed += rows.length;
        
        for (const row of rows) {
          await updateByCodeVariants(row.code, row.qty, locationId, summary, 'out', row.purchaseType, row.size, row.originalSize, row.originalPurchaseType);
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

// Excel导入功能 - 根据特定格式优化
router.post('/excel', upload.array('files'), async (req, res) => {
  try {
    console.log('调试: 收到Excel导入请求');
    
    const files = req.files as Express.Multer.File[];
    
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
    
    // 动态导入xlsx库
    const XLSX = await import('xlsx');
    
    // 获取所有门市信息
    const locations = await Location.find({});
    const locationMap = new Map<string, string>();
    locations.forEach(loc => locationMap.set(loc.name, String(loc._id)));
    
    console.log('调试: 可用门市:', Array.from(locationMap.keys()));
    
    for (const file of files) {
      try {
        console.log(`调试: 处理文件 ${file.originalname}`);
        
        // 解析Excel文件
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          summary.errors.push('Excel文件格式错误：至少需要标题行和数据行');
          continue;
        }
        
        console.log(`调试: Excel数据行数: ${jsonData.length}`);
        
        // 根据您的Excel格式，列索引是固定的：
        // A列(0): 编号 (商品型号)
        // B列(1): 产品 (商品名称)  
        // C列(2): 尺寸
        // D列(3): 观塘
        // E列(4): 湾仔
        // F列(5): 荔枝角
        // G列(6): 元朗
        // H列(7): 国内仓
        
        const COLUMN_MAPPING = {
          CODE: 0,      // A列: 编号
          NAME: 1,      // B列: 产品
          SIZE: 2,      // C列: 尺寸
          LOCATIONS: {
            '观塘': 3,    // D列
            '湾仔': 4,    // E列
            '荔枝角': 5,  // F列
            '元朗': 6,    // G列
            '国内仓': 7   // H列
          }
        };
        
        // 创建门市名称映射表（处理繁简体问题）
        const locationNameMapping: { [key: string]: string } = {
          '观塘': '觀塘',
          '湾仔': '灣仔', 
          '荔枝角': '荔枝角',
          '元朗': '元朗',
          '国内仓': '國内倉'
        };
        
        // 处理数据行（跳过标题行）
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          
          if (!row || row.length === 0) continue;
          
          const productCode = row[COLUMN_MAPPING.CODE]?.toString()?.trim();
          const productName = row[COLUMN_MAPPING.NAME]?.toString()?.trim();
          const size = row[COLUMN_MAPPING.SIZE]?.toString()?.trim();
          
          if (!productCode) {
            console.log(`调试: 第${i+1}行缺少商品型号，跳过`);
            continue;
          }
          
          console.log(`调试: 处理商品 - 型号: ${productCode}, 尺寸: ${size}`);
          summary.processed++;
          
          // 使用改进的产品查找逻辑
          let product = await findProductByCodeAndSize(productCode, size);
          
          if (!product) {
            console.log(`调试: 未找到商品 ${productCode} (尺寸: ${size})`);
            summary.notFound.push(`${productCode} (${size})`);
            continue;
          }
          
          console.log(`调试: 找到商品 ${product.productCode} - ${product.name}`);
          summary.matched++;
          
          // 更新各门市的库存
          let hasUpdates = false;
          for (const [excelLocationName, columnIndex] of Object.entries(COLUMN_MAPPING.LOCATIONS)) {
            const quantity = parseInt(row[columnIndex]) || 0;
            
            // 使用映射表获取数据库中的门市名称
            const dbLocationName = locationNameMapping[excelLocationName] || excelLocationName;
            
            if (locationMap.has(dbLocationName)) {
              const locationId = locationMap.get(dbLocationName)!;
              
              // 查找或创建库存记录
              let inventory = product.inventories.find((inv: any) => 
                String(inv.locationId) === locationId
              );
              
              if (!inventory) {
                inventory = { 
                  locationId: new mongoose.Types.ObjectId(locationId), 
                  quantity: 0 
                };
                product.inventories.push(inventory);
                console.log(`调试: 为 ${product.productCode} 创建新的库存记录 - ${dbLocationName}`);
              }
              
              // 设置库存数量（Excel中的数量就是最终数量，不是增量）
              const oldQuantity = inventory.quantity;
              inventory.quantity = quantity;
              
              if (quantity !== oldQuantity) {
                hasUpdates = true;
                console.log(`调试: ${product.productCode}(${size}) ${excelLocationName}->${dbLocationName} 库存更新: ${oldQuantity} -> ${quantity}`);
              }
            } else {
              console.log(`调试: 未找到门市 ${excelLocationName} (映射为 ${dbLocationName})`);
            }
          }
          
          // 强制保存产品，即使没有数量变化也要保存新创建的库存记录
          if (hasUpdates || product.inventories.some((inv: any) => inv.isNew)) {
            await product.save();
            summary.updated++;
            console.log(`调试: 已保存产品 ${product.productCode}(${size})`);
          }
          

          
          summary.parsed.push({
            name: productName,
            code: productCode,
            size: size
          });
        }
        
      } catch (error) {
        console.error('处理Excel文件时出错:', error);
        summary.errors.push(`Excel文件处理错误: ${error}`);
      }
    }
    
    console.log('调试: Excel导入完成', summary);
    res.json(summary);
    
  } catch (error) {
    console.error('Excel导入处理错误:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

// 根据商品型号和尺寸查找产品的改进函数
async function findProductByCodeAndSize(code: string, size: string) {
  console.log(`调试: 查找商品 - 型号: ${code}, 尺寸: ${size}`);
  
  // 1. 先尝试精确匹配：型号和尺寸都匹配
  let products = await Product.find({
    productCode: { $regex: new RegExp(`^${normalizeCode(code)}$`, 'i') },
    sizes: size ? { $in: [size] } : { $exists: true }
  });
  
  if (products.length > 0) {
    console.log(`调试: 精确匹配 ${code} (${size}) -> ${products[0].productCode}`);
    return products[0];
  }
  
  // 2. 匹配型号，不管尺寸
  products = await Product.find({
    productCode: { $regex: new RegExp(`^${normalizeCode(code)}$`, 'i') }
  });
  
  if (products.length > 0) {
    // 优先选择已经包含该尺寸的产品
    if (size) {
      const productWithSize = products.find(p => 
        p.sizes && p.sizes.includes(size)
      );
      if (productWithSize) {
        console.log(`调试: 型号匹配+尺寸找到 ${code} (${size}) -> ${productWithSize.productCode}`);
        return productWithSize;
      }
    }
    
    // 如果没有找到包含该尺寸的产品，选择第一个产品并添加尺寸
    const firstProduct = products[0];
    if (size && !firstProduct.sizes.includes(size)) {
      console.log(`调试: 为产品 ${firstProduct.productCode} 添加新尺寸 ${size}`);
      firstProduct.sizes.push(size);
      await firstProduct.save();
    }
    
    console.log(`调试: 型号匹配，使用产品 ${code} -> ${firstProduct.productCode} (已添加尺寸 ${size})`);
    return firstProduct;
  }
  
  // 3. 尝试基础代码匹配（去掉末尾数字）
  const baseCode = code.replace(/\d+$/, '');
  if (baseCode !== code) {
    products = await Product.find({
      productCode: { $regex: new RegExp(`^${normalizeCode(baseCode)}$`, 'i') }
    });
    
    if (products.length > 0) {
      const firstProduct = products[0];
      
      if (size && !firstProduct.sizes.includes(size)) {
        console.log(`调试: 为基础代码产品 ${firstProduct.productCode} 添加新尺寸 ${size}`);
        firstProduct.sizes.push(size);
        await firstProduct.save();
      }
      
      console.log(`调试: 基础代码匹配 ${code} -> ${baseCode} -> ${firstProduct.productCode}`);
      return firstProduct;
    }
  }
  
  // 4. 使用现有的变体匹配逻辑
  const codeVariants = generateWS712Variants(code);
  for (const variant of codeVariants) {
    products = await Product.find({
      productCode: { $regex: new RegExp(`^${normalizeCode(variant)}$`, 'i') }
    });
    
    if (products.length > 0) {
      const firstProduct = products[0];
      
      if (size && !firstProduct.sizes.includes(size)) {
        console.log(`调试: 为变体产品 ${firstProduct.productCode} 添加新尺寸 ${size}`);
        firstProduct.sizes.push(size);
        await firstProduct.save();
      }
      
      console.log(`调试: 变体匹配 ${code} -> ${variant} -> ${firstProduct.productCode}`);
      return firstProduct;
    }
  }
  
  console.log(`调试: 未找到匹配的商品 ${code} (${size})`);
  return null;
}

// 门市对调功能
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    console.log('调试: 收到门市对调请求');
    
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!fromLocationId || !toLocationId) {
      return res.status(400).json({ message: '缺少来源门市或目标门市ID' });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: '缺少PDF文件' });
    }
    
    if (fromLocationId === toLocationId) {
      return res.status(400).json({ message: '来源门市和目标门市不能相同' });
    }
    
    // 验证门市是否存在
    const fromLocation = await Location.findById(fromLocationId);
    const toLocation = await Location.findById(toLocationId);
    
    if (!fromLocation || !toLocation) {
      return res.status(400).json({ message: '门市不存在' });
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
    
    console.log(`调试: 门市对调 - 从 ${fromLocation.name} 到 ${toLocation.name}`);
    
    for (const file of files) {
      try {
        console.log(`调试: 处理文件 ${file.originalname}`);
        
        // 解析PDF文件
        const transferItems = await extractTransferItems(file.buffer);
        console.log(`调试: 从PDF提取到 ${transferItems.length} 个转移项目`);
        
        summary.parsed.push(...transferItems);
        summary.processed += transferItems.length;
        
        // 处理每个转移项目
        for (const item of transferItems) {
          await processTransferItem(item, fromLocationId, toLocationId, summary);
        }
        
      } catch (error) {
        console.error('处理文件时出错:', error);
        summary.errors.push(`文件处理错误: ${error}`);
      }
    }
    
    console.log('调试: 门市对调处理完成', summary);
    res.json(summary);
    
  } catch (error) {
    console.error('门市对调处理错误:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

// 从PDF中提取门市对调项目的函数
async function extractTransferItems(buffer: Buffer): Promise<{ code: string; size: string; qty: number }[]> {
  const items: { code: string; size: string; qty: number }[] = [];
  
  try {
    const data = await pdf(buffer);
    const text = data.text;
    
    if (!text) {
      throw new Error('PDF文本为空');
    }
    
    console.log('调试: PDF文本长度:', text.length);
    
    // 按行分割文本
    const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
    console.log('调试: PDF总行数:', lines.length);
    
    // 简化的解析逻辑：直接查找包含商品代码、尺寸和数量的行
    let inDataSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 跳过表头，寻找数据开始
      if (line.includes('商品詳情')) {
        inDataSection = true;
        console.log(`调试: 进入数据区域，第${i+1}行: "${line}"`);
        continue;
      }
      
      if (!inDataSection) continue;
      
      // 查找包含商品代码和数量的行
      const productMatch = line.match(/(WS-[A-Z0-9]+)(.*)(\d+)\s*$/);
      if (productMatch) {
        const code = productMatch[1];
        const middle = productMatch[2];
        const qtyStr = productMatch[3];
        const qty = parseInt(qtyStr, 10);
        
        // 验证数量是否合理
        if (qty >= 1 && qty <= 100) {
          let size = 'default';
          
          // 从中间部分提取尺寸信息
          const sizeMatch = middle.match(/([A-Z]{1,3}L?|上衣\s*\|\s*(\d+)|褲子\s*\|\s*(\d+)|\d+)/);
          if (sizeMatch) {
            size = sizeMatch[1] || sizeMatch[2] || sizeMatch[3] || 'default';
          }
          
          console.log(`调试: 找到商品 - 代码: ${code}, 尺寸: ${size}, 数量: ${qty}`);
          console.log(`调试: 原始行: "${line}"`);
          
          items.push({
            code: code,
            size: size,
            qty: qty
          });
        }
      }
      
      // 特殊格式：商品代码在行首，数量在行尾，中间有尺寸信息
      const specialMatch = line.match(/^(WS-[A-Z0-9]+)\s+(.+?)\s+([A-Z]{1,3}L?|\d+)$/);
      if (specialMatch && !productMatch) {
        const code = specialMatch[1];
        const description = specialMatch[2];
        const sizeOrQty = specialMatch[3];
        
        // 检查下一行是否有数量
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const qtyMatch = nextLine.match(/^(\d+)$/);
          if (qtyMatch) {
            const qty = parseInt(qtyMatch[1], 10);
            if (qty >= 1 && qty <= 100) {
              console.log(`调试: 找到特殊格式商品 - 代码: ${code}, 尺寸: ${sizeOrQty}, 数量: ${qty}`);
              console.log(`调试: 原始行1: "${line}"`);
              console.log(`调试: 原始行2: "${nextLine}"`);
              
              items.push({
                code: code,
                size: sizeOrQty,
                qty: qty
              });
              
              i++; // 跳过下一行
            }
          }
        }
      }
    }
    
    console.log(`调试: 最终提取到 ${items.length} 个有效项目`);
    
    // 去重和合并相同商品的数量
    const mergedItems = mergeItems(items);
    console.log(`调试: 合并后 ${mergedItems.length} 个唯一商品`);
    
    return mergedItems;
    
  } catch (error) {
    console.error('PDF解析错误:', error);
    throw error;
  }
}





// 解析尺寸和数量信息
function parseSizeAndQuantity(text: string, fullLine: string): { size?: string; qty?: number } {
  let size: string | undefined;
  let qty: number | undefined;
  
  // 查找尺寸信息（各种格式）
  const sizePatterns = [
    /([A-Z]{1,3}L?)\s*$/, // XS, S, M, L, XL, XXL等
    /(\d+)\s*$/, // 数字尺寸如1, 10, 12等
    /上衣\s*\|\s*(\d+)/, // 上衣|10格式
    /褲子\s*\|\s*(\d+)/, // 裤子|10格式
    /(\d+)\s*\|\s*(上衣|褲子)/, // 10|上衣格式
  ];
  
  for (const pattern of sizePatterns) {
    const match = text.match(pattern) || fullLine.match(pattern);
    if (match) {
      size = match[1];
      break;
    }
  }
  
  // 查找数量信息
  const qtyMatch = text.match(/\b([1-9]\d{0,2})\b/) || fullLine.match(/\b([1-9]\d{0,2})\b/);
  if (qtyMatch) {
    const extractedQty = parseInt(qtyMatch[1], 10);
    if (extractedQty >= 1 && extractedQty <= 100) { // 合理的数量范围
      qty = extractedQty;
    }
  }
  
  return { size, qty };
}

// 合并相同商品代码和尺寸的项目
function mergeItems(items: { code: string; size: string; qty: number }[]): { code: string; size: string; qty: number }[] {
  const merged = new Map<string, { code: string; size: string; qty: number }>();
  
  for (const item of items) {
    const key = `${item.code}-${item.size}`;
    
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      existing.qty += item.qty;
    } else {
      merged.set(key, { ...item });
    }
  }
  
  return Array.from(merged.values());
}

// 改进的产品查找函数
async function findProductByCode(code: string) {
  // 1. 直接匹配
  let product = await Product.findOne({
    productCode: { $regex: new RegExp(`^${normalizeCode(code)}$`, 'i') }
  });
  
  if (product) {
    console.log(`调试: 直接匹配找到产品: ${code} -> ${product.productCode}`);
    return product;
  }
  
  // 2. 去掉末尾数字后匹配基础代码
  const baseCode = code.replace(/\d+$/, '');
  if (baseCode !== code) {
    product = await Product.findOne({
      productCode: { $regex: new RegExp(`^${normalizeCode(baseCode)}$`, 'i') }
    });
    
    if (product) {
      console.log(`调试: 基础代码匹配找到产品: ${code} -> ${baseCode} -> ${product.productCode}`);
      return product;
    }
  }
  
  // 3. 使用现有的代码变体匹配逻辑
  const codeVariants = generateWS712Variants(code);
  for (const variant of codeVariants) {
    product = await Product.findOne({
      productCode: { $regex: new RegExp(`^${normalizeCode(variant)}$`, 'i') }
    });
    if (product) {
      console.log(`调试: 变体匹配找到产品: ${code} -> ${variant} -> ${product.productCode}`);
      return product;
    }
  }
  
  // 4. 尝试基础代码的变体
  if (baseCode !== code) {
    const baseVariants = generateWS712Variants(baseCode);
    for (const variant of baseVariants) {
      product = await Product.findOne({
        productCode: { $regex: new RegExp(`^${normalizeCode(variant)}$`, 'i') }
      });
      if (product) {
        console.log(`调试: 基础变体匹配找到产品: ${code} -> ${baseCode} -> ${variant} -> ${product.productCode}`);
        return product;
      }
    }
  }
  
  return null;
}



// 处理单个转移项目
async function processTransferItem(
  item: { code: string; size: string; qty: number }, 
  fromLocationId: string, 
  toLocationId: string, 
  summary: any
) {
  try {
    console.log(`调试: 处理转移项目 - 型号: ${item.code}, 尺寸: ${item.size}, 数量: ${item.qty}`);
    
    // 改进的产品匹配逻辑
    let product = await findProductByCode(item.code);
    
    if (!product) {
      console.log(`调试: 未找到产品 ${item.code}`);
      summary.notFound.push(item.code);
      return;
    }
    
    console.log(`调试: 找到产品 ${product.name} (${product.productCode})`);
    summary.matched++;
    
    // 确保产品有指定的尺寸
    if (!product.sizes.includes(item.size)) {
      product.sizes.push(item.size);
      console.log(`调试: 添加新尺寸 ${item.size} 到产品 ${product.productCode}`);
    }
    
    // 查找或创建来源门市的库存记录
    let fromInventory = product.inventories.find((inv: any) => 
      String(inv.locationId) === fromLocationId
    );
    
    if (!fromInventory) {
      fromInventory = {
        locationId: new mongoose.Types.ObjectId(fromLocationId),
        quantity: 0
      };
      product.inventories.push(fromInventory);
    }
    
    // 查找或创建目标门市的库存记录
    let toInventory = product.inventories.find((inv: any) => 
      String(inv.locationId) === toLocationId
    );
    
    if (!toInventory) {
      toInventory = {
        locationId: new mongoose.Types.ObjectId(toLocationId),
        quantity: 0
      };
      product.inventories.push(toInventory);
    }
    
    // 检查来源门市是否有足够的库存
    if (fromInventory.quantity < item.qty) {
      console.log(`调试: 库存不足 - 需要: ${item.qty}, 现有: ${fromInventory.quantity}`);
      summary.errors.push(`${item.code} (${item.size}) 库存不足：需要 ${item.qty}，现有 ${fromInventory.quantity}`);
      return;
    }
    
    // 执行转移
    fromInventory.quantity -= item.qty;
    toInventory.quantity += item.qty;
    
    console.log(`调试: 转移完成 - ${item.code} (${item.size}) x${item.qty}`);
    console.log(`调试: 来源门市库存: ${fromInventory.quantity + item.qty} -> ${fromInventory.quantity}`);
    console.log(`调试: 目标门市库存: ${toInventory.quantity - item.qty} -> ${toInventory.quantity}`);
    
    await product.save();
    summary.updated++;
    
  } catch (error) {
    console.error(`处理转移项目时出错 (${item.code}):`, error);
    summary.errors.push(`处理 ${item.code} 时出错: ${error}`);
  }
}

// 清零所有商品库存
router.post('/clear', async (req, res) => {
  try {
    console.log('调试: 收到清零所有库存请求');
    
    const summary = {
      processed: 0,
      updated: 0,
      errors: [] as string[]
    };
    
    // 获取所有商品
    const products = await Product.find({});
    console.log(`调试: 找到 ${products.length} 个商品需要清零`);
    
    summary.processed = products.length;
    
    // 清零所有商品的库存
    for (const product of products) {
      try {
        // 将所有门市的库存设置为0
        for (const inventory of product.inventories) {
          inventory.quantity = 0;
        }
        
        await product.save();
        summary.updated++;
        
        if (summary.updated % 100 === 0) {
          console.log(`调试: 已清零 ${summary.updated} 个商品`);
        }
        
      } catch (error) {
        console.error(`清零商品 ${product.productCode} 时出错:`, error);
        summary.errors.push(`${product.productCode}: ${error}`);
      }
    }
    
    console.log(`调试: 清零完成 - 处理: ${summary.processed}, 更新: ${summary.updated}, 错误: ${summary.errors.length}`);
    
    res.json(summary);
    
  } catch (error) {
    console.error('清零处理错误:', error);
    res.status(500).json({ message: 'Internal server error', error: error });
  }
});

export default router;