// Excel導入功能 - 修復版本
// Excel導入功能 - 修復版本 (純JavaScript)
router.post('/excel', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到Excel導入請求');
    const files = req.files;
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
      errors: []
    };
    
    for (const file of files) {
      try {
        console.log(`調試: 處理文件 ${file.originalname}, 大小: ${file.size} bytes`);
        
        // 讀取Excel文件 - 增加更多選項
        const workbook = XLSX.read(file.buffer, { 
          type: 'buffer',
          cellDates: true,
          cellNF: false,
          cellText: false,
          raw: false
        });
        
        console.log('調試: Excel工作表名稱:', workbook.SheetNames);
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // 檢查工作表是否存在
        if (!worksheet) {
          summary.errors.push(`文件 ${file.originalname}: 無法讀取工作表`);
          continue;
        }
        
        // 轉換為JSON，增加更多選項
        const data = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false
        });
        
        console.log('調試: Excel數據行數:', data.length);
        console.log('調試: Excel前3行數據:', data.slice(0, 3));
        
        if (data.length < 2) {
          summary.errors.push(`文件 ${file.originalname}: 數據行數不足 (只有 ${data.length} 行)`);
          continue;
        }
        
        // 獲取標題行（第一行）
        const headers = data[0];
        console.log('調試: Excel標題行:', headers);
        
        // 清理標題行，移除空值和轉換為字符串
        const cleanHeaders = headers.map((h) => {
          if (h === null || h === undefined) return '';
          return String(h).trim();
        }).filter(h => h !== '');
        
        console.log('調試: 清理後的標題行:', cleanHeaders);
        
        // 根據第一行內容判斷列類型
        const columnIndexes = {};
        const columnMappings = {
          'productCode': ['編號', '型號', '產品編號', '貨號', 'SKU', '產品代碼', '代碼', '編碼'],
          'productName': ['產品', '商品詳情', '商品名稱', '產品名稱', '名稱', '商品', '品名'],
          'size': ['尺寸', '商品選項', '規格', '選項', '尺碼', '大小'],
          '觀塘': ['觀塘', '觀塘店', '觀塘門市', '觀塘倉', '觀塘庫存'],
          '灣仔': ['灣仔', '灣仔店', '灣仔門市', '灣仔倉', '灣仔庫存'],
          '荔枝角': ['荔枝角', '荔枝角店', '荔枝角門市', '荔枝角倉', '荔枝角庫存'],
          '元朗': ['元朗', '元朗店', '元朗門市', '元朗倉', '元朗庫存'],
          '國内倉': ['國內倉', '國内倉', '倉庫', '總倉', '國内', '國內', '國内倉庫', '國內倉庫']
        };
        
        // 識別列索引 - 改進匹配邏輯
        for (const [columnType, variants] of Object.entries(columnMappings)) {
          let found = false;
          for (const variant of variants) {
            const index = cleanHeaders.findIndex(h => h === variant);
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
        const locationMap = {};
        locations.forEach((loc) => {
          locationMap[loc.name] = loc._id.toString();
        });
        
        console.log('調試: 門市映射:', locationMap);
        
        // 從第二行開始處理數據
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;
          
          try {
            // 提取基本產品信息 - 增加空值檢查
            const productCode = row[columnIndexes.productCode];
            const productName = row[columnIndexes.productName];
            const size = row[columnIndexes.size];
            
            // 轉換為字符串並清理
            const cleanProductCode = productCode ? String(productCode).trim() : '';
            const cleanProductName = productName ? String(productName).trim() : '';
            const cleanSize = size ? String(size).trim() : '';
            
            if (!cleanProductCode || !cleanProductName || !cleanSize) {
              summary.errors.push(`第${i+1}行: 編號、產品名稱或尺寸為空 (編號: "${cleanProductCode}", 名稱: "${cleanProductName}", 尺寸: "${cleanSize}")`);
              continue;
            }
            
            summary.processed++;
            console.log(`調試: 處理第${i+1}行 - 編號: ${cleanProductCode}, 名稱: ${cleanProductName}, 尺寸: ${cleanSize}`);
            
            // 查找現有產品
            let product = await Product.findOne({
              name: cleanProductName,
              productCode: cleanProductCode,
              $or: [
                { size: cleanSize },
                { sizes: { $in: [cleanSize] } }
              ]
            });
            
            if (product) {
              // 更新現有產品的庫存
              summary.matched++;
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantityValue = row[columnIndexes[locationName]];
                  const quantity = quantityValue ? parseInt(String(quantityValue), 10) : 0;
                  
                  if (quantity > 0) {
                    const locationId = locationMap[locationName];
                    if (locationId) {
                      let inventory = product.inventories.find((inv) => inv.locationId.toString() === locationId);
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
              if (cleanProductName.includes('保暖') || cleanProductName.includes('防寒')) {
                productType = '保暖衣';
              } else if (cleanProductName.includes('抓毛')) {
                productType = '抓毛';
              } else if (cleanProductName.includes('上水')) {
                productType = '上水褸';
              }
              
              // 收集各門市的庫存
              const inventories = [];
              for (const locationName of ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantityValue = row[columnIndexes[locationName]];
                  const quantity = quantityValue ? parseInt(String(quantityValue), 10) : 0;
                  
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
          } catch (rowError) {
            const errorMsg = `第${i+1}行處理錯誤: ${rowError}`;
            console.error('調試:', errorMsg);
            summary.errors.push(errorMsg);
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