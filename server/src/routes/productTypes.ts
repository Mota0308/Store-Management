import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

// 產品類型模型
const ProductTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' }
}, { timestamps: true });

const ProductType = mongoose.model('ProductType', ProductTypeSchema, 'productTypes');

// 獲取所有產品類型
router.get('/', async (req, res) => {
  try {
    const types = await ProductType.find().sort({ name: 1 });
    res.json(types);
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch product types', error: String(e) });
  }
});

// 批量創建產品類型
router.post('/batch', async (req, res) => {
  try {
    const { types } = req.body;
    if (!Array.isArray(types) || types.length === 0) {
      return res.status(400).json({ message: 'Types array is required' });
    }

    const validTypes = types
      .map((t: any) => typeof t === 'string' ? t.trim() : '')
      .filter((t: string) => t.length > 0);

    if (validTypes.length === 0) {
      return res.status(400).json({ message: 'No valid types provided' });
    }

    // 檢查已存在的類型
    const existingTypes = await ProductType.find({ name: { $in: validTypes } });
    const existingNames = existingTypes.map(t => t.name);
    const newTypes = validTypes.filter(name => !existingNames.includes(name));

    if (newTypes.length === 0) {
      return res.json({ 
        message: 'All types already exist', 
        created: 0, 
        existing: existingNames 
      });
    }

    // 創建新類型
    const typeDocs = newTypes.map(name => ({ name, description: '' }));
    const created = await ProductType.insertMany(typeDocs);

    res.json({ 
      message: `Created ${created.length} new product types`, 
      created: created.length,
      existing: existingNames,
      newTypes: created.map(t => t.name)
    });
  } catch (e) {
    res.status(500).json({ message: 'Failed to create product types', error: String(e) });
  }
});

// 創建單個產品類型
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }

    const productType = await ProductType.create({ 
      name: name.trim(), 
      description: description || '' 
    });
    res.status(201).json(productType);
  } catch (e) {
    if (e.code === 11000) {
      res.status(400).json({ message: 'Product type already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create product type', error: String(e) });
    }
  }
});

// 刪除產品類型
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ProductType.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ message: 'Product type not found' });
    }
    res.json({ message: 'Product type deleted successfully' });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete product type', error: String(e) });
  }
});

export default router;
