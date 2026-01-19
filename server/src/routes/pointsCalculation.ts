import { Router, Request, Response } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import PointsCombo from '../models/PointsCombo';
import Product from '../models/Product';
import DailyPoint from '../models/DailyPoint';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 从PDF提取订单信息（简化版，只提取产品代码和数量）
async function extractOrderFromPDF(buffer: Buffer): Promise<{
  orderNumber?: string;
  orderDate?: Date;
  items: Array<{ productCode: string; quantity: number }>;
}> {
  const data = await pdf(buffer);
  const text = data.text;
  
  const result: {
    orderNumber?: string;
    orderDate?: Date;
    items: Array<{ productCode: string; quantity: number }>;
  } = {
    items: []
  };

  // 提取订单编号
  const orderNumberMatch = text.match(/訂單編號[：:]\s*(\d+)/);
  if (orderNumberMatch) {
    result.orderNumber = orderNumberMatch[1];
  }

  // 提取订单日期
  const orderDateMatch = text.match(/訂單日期[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
  if (orderDateMatch) {
    const dateStr = orderDateMatch[1].replace(/\//g, '-');
    result.orderDate = new Date(dateStr);
  }

  // 提取商品信息（型号和数量）
  const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  const productMap = new Map<string, number>(); // 用于累加相同产品的数量

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 匹配产品代码（WS-xxx, AEP-WS-xxx, NMxxx等）
    const codeMatch = line.match(/(WS-\w+|AEP-WS-\w+|NM\d+)/);
    
    if (codeMatch && !line.includes('HK$')) {
      const productCode = codeMatch[1];
      
      // 查找数量 - 在后续行中查找
      let quantity = 1;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j];
        
        // 跳过其他产品行
        if (nextLine.match(/(WS-\w+|AEP-WS-\w+|NM\d+)/) && !nextLine.includes('HK$')) {
          break;
        }
        
        // 从纯数字行提取数量
        const qtyMatch = nextLine.match(/^\s*([1-9]\d{0,2})\s*$/);
        if (qtyMatch) {
          const extractedQty = parseInt(qtyMatch[1], 10);
          if (extractedQty >= 1 && extractedQty <= 999) {
            quantity = extractedQty;
            break;
          }
        }
        
        // 从表格格式中提取数量（| 数量 |）
        const tableQtyMatch = nextLine.match(/\|\s*(\d+)\s*\|/);
        if (tableQtyMatch) {
          const extractedQty = parseInt(tableQtyMatch[1], 10);
          if (extractedQty >= 1 && extractedQty <= 999) {
            quantity = extractedQty;
            break;
          }
        }
      }
      
      // 累加相同产品的数量
      if (productMap.has(productCode)) {
        productMap.set(productCode, productMap.get(productCode)! + quantity);
      } else {
        productMap.set(productCode, quantity);
      }
    }
  }

  // 转换为数组
  result.items = Array.from(productMap.entries()).map(([productCode, quantity]) => ({
    productCode,
    quantity
  }));

  return result;
}

// 计算积分
async function calculatePoints(items: Array<{ productCode: string; quantity: number }>): Promise<{
  items: Array<{
    productCode: string;
    quantity: number;
    unitPoints?: number;
    comboPoints?: number;
    points: number;
  }>;
  totalPoints: number;
  matchedCombos: string[];
}> {
  const resultItems: Array<{
    productCode: string;
    quantity: number;
    unitPoints?: number;
    comboPoints?: number;
    points: number;
  }> = [];
  
  const matchedCombos: string[] = [];
  let totalPoints = 0;

  // 获取所有积分组合
  const combos = await PointsCombo.find();
  
  // 获取所有产品
  const productCodes = items.map(item => item.productCode);
  const products = await Product.find({ productCode: { $in: productCodes } });
  const productMap = new Map(products.map(p => [p.productCode, p]));

  // 创建可修改的items副本
  const remainingItems = items.map(item => ({ ...item }));

  // 先尝试匹配组合
  for (const combo of combos) {
    const comboCodes = combo.productCodes;
    // 检查订单中是否包含组合中的所有产品
    const orderCodes = new Set(remainingItems.map(item => item.productCode));
    const hasAllComboProducts = comboCodes.every(code => orderCodes.has(code));
    
    if (hasAllComboProducts) {
      // 找到组合中每个产品的数量
      const comboItemQuantities = comboCodes.map(code => {
        const item = remainingItems.find(i => i.productCode === code);
        return item ? item.quantity : 0;
      });
      const minQuantity = Math.min(...comboItemQuantities);
      
      if (minQuantity > 0) {
        // 应用组合积分
        const comboPoints = combo.comboPoints * minQuantity;
        totalPoints += comboPoints;
        matchedCombos.push(`${combo.name} × ${minQuantity}`);
        
        // 为组合中的产品添加组合积分记录
        for (const code of comboCodes) {
          const existingItem = resultItems.find(item => item.productCode === code);
          const product = productMap.get(code);
          const itemQuantity = remainingItems.find(i => i.productCode === code)?.quantity || 0;
          
          if (existingItem) {
            existingItem.comboPoints = (existingItem.comboPoints || 0) + (combo.comboPoints * minQuantity / comboCodes.length);
            existingItem.points += combo.comboPoints * minQuantity / comboCodes.length;
          } else {
            resultItems.push({
              productCode: code,
              quantity: itemQuantity,
              unitPoints: product?.points || 0,
              comboPoints: combo.comboPoints * minQuantity / comboCodes.length,
              points: combo.comboPoints * minQuantity / comboCodes.length
            });
          }
        }
        
        // 减少已使用的数量
        for (const code of comboCodes) {
          const item = remainingItems.find(i => i.productCode === code);
          if (item) {
            item.quantity -= minQuantity;
            if (item.quantity <= 0) {
              remainingItems.splice(remainingItems.indexOf(item), 1);
            }
          }
        }
      }
    }
  }

  // 处理剩余的产品（未匹配到组合的）
  for (const item of remainingItems) {
    if (item.quantity > 0) {
      const product = productMap.get(item.productCode);
      const unitPoints = product?.points || 0;
      const points = unitPoints * item.quantity;
      totalPoints += points;
      
      const existingItem = resultItems.find(ri => ri.productCode === item.productCode);
      if (existingItem) {
        existingItem.unitPoints = (existingItem.unitPoints || 0) + unitPoints;
        existingItem.points += points;
        existingItem.quantity += item.quantity;
      } else {
        resultItems.push({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPoints,
          points
        });
      }
    }
  }

  return {
    items: resultItems,
    totalPoints,
    matchedCombos
  };
}

// 导入账单并计算积分
router.post('/import', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const results = [];

    for (const file of files) {
      try {
        // 提取订单信息
        const orderInfo = await extractOrderFromPDF(file.buffer);
        
        // 计算积分
        const calculation = await calculatePoints(orderInfo.items);
        
        // 确定日期（优先使用订单日期，否则使用今天）
        const date = orderInfo.orderDate || new Date();
        date.setHours(0, 0, 0, 0);
        
        // 保存到数据库
        const dailyPoint = await DailyPoint.findOneAndUpdate(
          {
            date,
            orderNumber: orderInfo.orderNumber
          },
          {
            date,
            orderNumber: orderInfo.orderNumber,
            orderDate: orderInfo.orderDate,
            items: calculation.items,
            totalPoints: calculation.totalPoints,
            matchedCombos: calculation.matchedCombos
          },
          { upsert: true, new: true }
        );

        results.push({
          orderNumber: orderInfo.orderNumber,
          orderDate: orderInfo.orderDate,
          totalPoints: calculation.totalPoints,
          matchedCombos: calculation.matchedCombos,
          itemsCount: calculation.items.length,
          saved: true
        });
      } catch (error) {
        console.error('处理文件失败:', error);
        results.push({
          error: error instanceof Error ? error.message : String(error),
          saved: false
        });
      }
    }

    res.json({ results, totalFiles: files.length });
  } catch (error) {
    console.error('导入账单失败:', error);
    res.status(500).json({ error: '导入账单失败' });
  }
});

// 获取每日积分统计
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query: any = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const dailyPoints = await DailyPoint.find(query)
      .sort({ date: -1, createdAt: -1 });

    // 按日期汇总
    const summary: { [date: string]: { totalPoints: number; orderCount: number; orders: any[] } } = {};
    
    for (const dp of dailyPoints) {
      const dateStr = dp.date.toISOString().split('T')[0];
      if (!summary[dateStr]) {
        summary[dateStr] = { totalPoints: 0, orderCount: 0, orders: [] };
      }
      summary[dateStr].totalPoints += dp.totalPoints;
      summary[dateStr].orderCount += 1;
      summary[dateStr].orders.push({
        orderNumber: dp.orderNumber,
        totalPoints: dp.totalPoints,
        matchedCombos: dp.matchedCombos,
        itemsCount: dp.items.length
      });
    }

    res.json({
      dailyPoints,
      summary: Object.entries(summary).map(([date, data]) => ({
        date,
        ...data
      }))
    });
  } catch (error) {
    console.error('获取每日积分统计失败:', error);
    res.status(500).json({ error: '获取每日积分统计失败' });
  }
});

// 删除每日积分记录
router.delete('/daily/:id', async (req: Request, res: Response) => {
  try {
    const dailyPoint = await DailyPoint.findByIdAndDelete(req.params.id);
    if (!dailyPoint) {
      return res.status(404).json({ error: '记录不存在' });
    }
    res.json({ message: '记录已删除' });
  } catch (error) {
    console.error('删除记录失败:', error);
    res.status(500).json({ error: '删除记录失败' });
  }
});

export default router;

