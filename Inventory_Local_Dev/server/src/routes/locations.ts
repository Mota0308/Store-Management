import { Router } from 'express';
import Location from '../models/Location';

const router = Router();

// list
router.get('/', async (_req, res) => {
  const locations = await Location.find().sort({ name: 1 });
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