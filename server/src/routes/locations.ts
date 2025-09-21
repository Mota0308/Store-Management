import { Router } from 'express';
import Location from '../models/Location';

const router = Router();

// list
router.get('/', async (_req, res) => {
  const allLocations = await Location.find();
  
  // 按照固定順序排列：進貨、上架、庫存調、觀塘、灣仔、荔枝角、元朗、國內倉、總庫
  const order = ['進貨', '上架', '庫存調', '觀塘', '灣仔', '荔枝角', '元朗', '國內倉', '總庫'];
  
  // 創建一個映射來處理可能的名稱變體
  const nameMapping: { [key: string]: string } = {
    '國內倉': '國內倉',
    '國內倉庫': '國內倉',
    '國內': '國內倉',
    '元朗': '元朗',
    '元朗倉': '元朗',
    '總庫': '總庫',
    '總倉庫': '總庫',
    '總計': '總庫'
  };
  
  const locations = allLocations.sort((a, b) => {
    // 使用映射來標準化名稱
    const aName = nameMapping[a.name] || a.name;
    const bName = nameMapping[b.name] || b.name;
    
    const aIndex = order.indexOf(aName);
    const bIndex = order.indexOf(bName);
    
    // 如果找不到匹配的地點名稱，放到最後
    const aOrder = aIndex === -1 ? 999 : aIndex;
    const bOrder = bIndex === -1 ? 999 : bIndex;
    
    return aOrder - bOrder;
  });
  res.json(locations);
});

// add
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const loc = await Location.create({ name });
    res.status(201).json(loc);
  } catch (e) {
    res.status(500).json({ message: 'Failed to create location', error: String(e) });
  }
});

export default router;
