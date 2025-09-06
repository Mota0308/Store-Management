import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

const ProductTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' }
}, { timestamps: true });

const ProductType = mongoose.model('ProductType', ProductTypeSchema, 'productTypes');

// 獲取所有產品類型
router.get('/', async (req, res) => {
  try {
    const productTypes = await ProductType.find().sort({ name: 1 });
    res.json(productTypes);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch product types', error: String(error) });
  }
});

// 批量創建產品類型
router.post('/batch', async (req, res) => {
  try {
    const { types } = req.body;
    if (!Array.isArray(types) || types.length === 0) {
      return res.status(400).json({ message: 'Types array is required' });
    }

    const productTypes = [];
    const errors = [];

    for (const typeName of types) {
      if (typeof typeName !== 'string' || !typeName.trim()) {
        errors.push(`Invalid type name: ${typeName}`);
        continue;
      }

      try {
        const productType = await ProductType.create({ name: typeName.trim() });
        productTypes.push(productType);
      } catch (error: any) {
        if (error.code === 11000) {
          errors.push(`Product type "${typeName}" already exists`);
        } else {
          errors.push(`Failed to create "${typeName}": ${error.message}`);
        }
      }
    }

    const message = `Created ${productTypes.length} product types${errors.length > 0 ? `. Errors: ${errors.join(', ')}` : ''}`;
    res.status(201).json({ 
      message, 
      created: productTypes.length, 
      errors: errors.length,
      productTypes 
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create product types', error: String(error) });
  }
});

// 創建單個產品類型
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }

    const productType = await ProductType.create({ name: name.trim(), description: description || '' });
    res.status(201).json(productType);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Product type already exists' });
    } else {
      res.status(500).json({ message: 'Failed to create product type', error: String(error) });
    }
  }
});

// 刪除產品類型
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const productType = await ProductType.findByIdAndDelete(id);
    
    if (!productType) {
      return res.status(404).json({ message: 'Product type not found' });
    }

    res.json({ message: 'Product type deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete product type', error: String(error) });
  }
});

export default router;
