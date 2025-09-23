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

// 修改：同時提取購買類型和尺寸信息
function extractPurchaseTypeAndSize(text: string): { purchaseType?: string; size?: string } {
  // 匹配購買類型模式
  const purchaseTypePatterns = [
    // 最高優先級：最後位置的類型（緊鄰尺寸的位置）
    /(上衣|褲子|套裝)\s*\|\s*\d+(?:\s|$)/,    // 例如: "上衣 | 10", "褲子 | 8"
    /(上衣|褲子|套裝)\s+\d+(?:\s|$)/,         // 例如: "上衣 10", "褲子 8"
    /(上衣|褲子|套裝)\s+[A-Z]+(?:\s|$)/,      // 例如: "上衣 XL"
    // 其他位置的類型
    /(上衣|褲子|套裝)/,
    /保暖(上衣|褲子)/,
    /抓毛.*?(上衣|褲子)/,
    /(上衣|褲子).*?保暖/,
    /(上衣|褲子).*?抓毛/
  ];
  
  // 匹配尺寸模式
  const sizePatterns = [
    // 最高優先級：| 分隔格式 (WS-712專用)
    /\|\s*(\d+)(?:\s|$)/,                     // 例如: "| 10"
    // 從產品代碼末尾提取
    /WS-\w+?(\d+)(?:\s|$)/,                   // 例如: WS-712TPP10 -> 10
    /WS-\w+-([A-Z]+)(?:\s|$)/,                // 例如: WS-252BK-XXL -> XXL
    // 行末尺寸
    /\s(\d+)(?:\s|$)/,                        // 行末數字
    /\s([A-Z]+)(?:\s|$)/,                     // 行末字母尺寸
  ];
  
  let purchaseType: string | undefined;
  let size: string | undefined;
  
  // 提取購買類型
  for (const pattern of purchaseTypePatterns) {
    const match = text.match(pattern);
    if (match) {
      const type = match[1] || match[0];
      
      // 標準化購買類型
      if (type.includes('上衣')) {
        purchaseType = '上衣';
        break;
      }
      if (type.includes('褲子')) {
        purchaseType = '褲子';
        break;
      }
      if (type.includes('套裝')) {
        purchaseType = '套裝';
        break;
      }
    }
  }
  
  // 提取尺寸
  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      const extractedSize = match[1];
      
      // 驗證和處理尺寸
      if (/^\d+$/.test(extractedSize)) {
        const sizeNum = parseInt(extractedSize, 10);
        if (!isNaN(sizeNum) && sizeNum >= 1 && sizeNum <= 30) {
          size = extractedSize;
          break;
        }
      } else if (/^[A-Z]+$/.test(extractedSize) && extractedSize.length <= 4) {
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
  
  // 其他產品只需要尺寸匹配
  let matchedProduct = null;
  if (size) {
    console.log(`調試: 根據尺寸 ${size} 匹配產品`);
    for (const product of products) {
      const hasMatchingSize = product.sizes && size && product.sizes.includes(size);
      
      if (hasMatchingSize) {
        matchedProduct = product;
        break;
      }
    }
    
    if (!matchedProduct) {
      summary.notFound.push(`${normalizeCode(code)} (尺寸: ${size})`);
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

// 解析产品表格行的函数
function parseProductTableRow(line: string, lines: string[], currentIndex: number) {
  try {
    // 查找产品型号
    const codeMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
    if (!codeMatch) return null;
    
    const productCode = codeMatch[1];
    
    // 查找包含尺寸和购买类型信息的后续行
    let size = '';
    let purchaseType = '';
    
    // 在后续几行中查找详细信息行（通常在产品描述后的下一行）
    for (let j = currentIndex + 1; j <= Math.min(lines.length - 1, currentIndex + 4); j++) {
      const detailLine = lines[j];
      
      // 跳过价格行和无关行
      if (detailLine.includes('HK$') || detailLine.includes(productCode)) {
        continue;
      }
      
      console.log(`调试: 检查第${j+1}行详细信息: ${detailLine}`);
      
      // 查找尺寸信息
      const sizeMatch = detailLine.match(/尺寸?\s*[:：]?\s*([^\s,，]+)/);
      if (sizeMatch) {
        size = sizeMatch[1].trim();
        console.log(`调试: 找到尺寸信息: ${size}`);
      }
      
             // 查找购买类型信息 (处理字符编码问题，"類"可能显示为"觊")
       const purchaseTypeMatch = detailLine.match(/購買[類觊]型\s*[:：]?\s*([^\s,，]+)/);
       if (purchaseTypeMatch) {
         purchaseType = purchaseTypeMatch[1].trim();
         console.log(`调试: 找到购买类型: ${purchaseType}`);
       }
      
             // 如果同时找到了尺寸和购买类型信息，就可以停止搜索了
       if (size && purchaseType) {
         break;
       }
    }
    
    // 查找数量 - 在后续行中查找数量+价格的组合
    let quantity = 0;
    
    for (let j = currentIndex + 1; j <= Math.min(lines.length - 1, currentIndex + 4); j++) {
      const nextLine = lines[j];
      
      // 查找格式如 "WS-258PK1HK$423.00HK$423.00" 的行
      const qtyPriceMatch = nextLine.match(new RegExp(`${productCode}(\\d+)HK\\$`));
      if (qtyPriceMatch) {
        const qty = parseInt(qtyPriceMatch[1], 10);
        if (qty > 0 && qty <= 50) { // 放宽数量限制到50
          quantity = qty;
          console.log(`调试: 在第${j+1}行找到数量 ${quantity}: ${nextLine}`);
          break;
        }
      }
      
      // 特殊处理NM系列
      if (productCode.startsWith('NM') && nextLine.includes(productCode) && nextLine.includes('HK$')) {
        const nmMatch = nextLine.match(new RegExp(`${productCode}(\\d+)HK\\$`));
        if (nmMatch) {
          const qty = parseInt(nmMatch[1], 10);
          if (qty > 0 && qty <= 50) {
            quantity = qty;
            console.log(`调试: NM系列在第${j+1}行找到数量 ${quantity}: ${nextLine}`);
            break;
          }
        }
      }
    }
    
    if (quantity > 0) {
      console.log(`调试: 最终解析结果 - 型号: ${productCode}, 数量: ${quantity}, 尺寸: ${size || '无'}, 购买类型: ${purchaseType || '无'}`);
      return {
        code: productCode,
        quantity: quantity,
        size: size || undefined,
        purchaseType: purchaseType || undefined
      };
    }
    
    return null;
  } catch (error) {
    console.error('解析产品行时出错:', error);
    return null;
  }
}
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
        
        // 暂时禁用旧解析器避免冲突
        try { 
          // rows = await extractByPdfjs(file.buffer); 
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
          // 暂时禁用旧解析器避免冲突
          // rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF解析失敗:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
          const text = data.text;
          if (text) {
            console.log('调试: 开始解析出货PDF，采用表格结构解析');
            
            // 查找产品表格的开始和结束
            const tableStartKeywords = ['商品詳情', '型號', '數量', '價格'];
            const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            
            let inProductTable = false;
            const extractedProducts = [];
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              
              // 检测表格开始
              if (tableStartKeywords.some(keyword => line.includes(keyword))) {
                inProductTable = true;
                console.log(`调试: 发现产品表格标题行 ${i+1}: ${line}`);
                continue;
              }
              
              // 检测表格结束
              if (line.includes('--END--') || line.includes('總計') || line.includes('合計')) {
                inProductTable = false;
                console.log(`调试: 产品表格结束于第 ${i+1} 行`);
                break;
              }
              
              // 在表格区域内解析产品信息
              if (inProductTable) {
                // 查找包含产品型号的行
                const productMatch = line.match(/\b((?:WS-\d+\w*)|(?:NM\d+))\b/);
                if (productMatch && !line.includes('套裝') && !line.includes('發纏號碼')) {
                  const productCode = productMatch[1];
                  
                  console.log(`调试: 第${i+1}行发现产品型号: ${productCode}`);
                  console.log(`调试: 产品行内容: ${line}`);
                  
                                     // 分析当前行来提取信息
                   const productInfo = parseProductTableRow(line, lines, i);
                  
                  if (productInfo) {
                    extractedProducts.push({
                      name: '',
                      code: productInfo.code,
                      qty: productInfo.quantity,
                      size: productInfo.size,
                      purchaseType: productInfo.purchaseType
                    });
                    
                    console.log(`调试: 成功解析产品 - 型号: ${productInfo.code}, 数量: ${productInfo.quantity}, 尺寸: ${productInfo.size || '无'}, 购买类型: ${productInfo.purchaseType || '无'}`);
                  }
                }
              }
            }
            
            // 去重处理
            const uniqueProducts = [];
            const seenKeys = new Set();
            
            for (const product of extractedProducts) {
              const key = `${product.code}-${product.size || ''}-${product.purchaseType || ''}`;
              if (!seenKeys.has(key)) {
                uniqueProducts.push(product);
                seenKeys.add(key);
              }
            }
            
            rows = uniqueProducts;
            console.log(`调试: 解析完成，提取到 ${rows.length} 个唯一产品`);
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