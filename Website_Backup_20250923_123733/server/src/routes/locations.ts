import { Router } from 'express';
import Location from '../models/Location';

const router = Router();

// list
router.get('/', async (_req, res) => {
  const allLocations = await Location.find();
  
  // 按照固定順序排列：觀塘、灣仔、荔枝角、元朗、國內倉
  const order = ['觀塘', '灣仔', '荔枝角', '元朗', '國內倉'];
  
  const locations = allLocations.sort((a, b) => {
    const aIndex = order.indexOf(a.name);
    const bIndex = order.indexOf(b.name);
    
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
