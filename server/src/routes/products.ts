import { Router } from 'express';
import Product from '../models/Product';
import mongoose from 'mongoose';

const router = Router();

// Create product
router.post('/', async (req, res) => {
  try {
    const { name, productCode, productType, sizes, price, locationIds, imageUrl } = req.body;
    if (!name || !productCode || !productType || !Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    const inventories = (locationIds || []).map((id: string) => ({ locationId: new mongoose.Types.ObjectId(id), quantity: 0 }));
    // 設置默認價格為0，如果沒有提供價格
    const productPrice = typeof price === 'number' ? price : 0;
    const product = await Product.create({ name, productCode, productType, sizes, price: productPrice, imageUrl, inventories });
    res.status(201).json(product);
  } catch (e) {
    res.status(500).json({ message: 'Failed to create', error: String(e) });
  }
});

// List with search/filter/sort and pagination
router.get('/', async (req, res) => {
  try {
    const { q, productCode, productType, size, locationId, sortBy, sortOrder } = req.query as Record<string, string>;

    const filter: any = {};
    if (q) filter.$text = { $search: q };
    if (productCode) filter.productCode = productCode;
    if (productType) filter.productType = productType;
    if (size) filter.sizes = size;
    if (locationId) filter['inventories.locationId'] = locationId;

    const sort: any = {};
    if (sortBy === 'price') sort.price = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'quantity') sort['inventories.quantity'] = sortOrder === 'asc' ? 1 : -1;

    const products = await Product.find(filter).sort(sort);
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: 'Failed to list', error: String(e) });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: 'Failed to get product', error: String(e) });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: 'Failed to update product', error: String(e) });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('收到刪除請求，商品ID:', id);
    
    // 先檢查商品是否存在
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      console.log('商品不存在:', id);
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log('找到商品:', existingProduct.name, existingProduct.productCode);
    
    // 執行刪除
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) {
      console.log('刪除失敗，商品不存在:', id);
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log('成功刪除商品:', deletedProduct.name, deletedProduct.productCode);
    res.json({ message: 'Product deleted successfully', deletedProduct: { name: deletedProduct.name, productCode: deletedProduct.productCode } });
  } catch (e) {
    console.error('刪除商品時發生錯誤:', e);
    res.status(500).json({ message: 'Failed to delete product', error: String(e) });
  }
});

// Update inventory quantities for a product per location
router.patch('/:id/inventory', async (req, res) => {
  try {
    const { id } = req.params;
    const { locationId, quantity, quantities } = req.body;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (quantities && Array.isArray(quantities)) {
      // 支持批量更新
      for (const { locationId: locId, quantity: qty } of quantities) {
        if (typeof locId === 'string' && typeof qty === 'number') {
          const inv = product.inventories.find(i => String(i.locationId) === String(locId));
          if (inv) {
            inv.quantity = qty;
          } else {
            product.inventories.push({ locationId: new mongoose.Types.ObjectId(locId), quantity: qty });
          }
        }
      }
    }
    // 支持單個更新（向後兼容）
    else if (locationId && typeof quantity === 'number') {
      const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
      if (inv) inv.quantity = quantity;
      else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity });
    } else {
      return res.status(400).json({ message: 'locationId and quantity are required, or quantities array for batch update' });
    }
    await product.save();
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: 'Failed to update inventory', error: String(e) });
  }
});

export default router;
