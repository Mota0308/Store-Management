import { Router } from 'express';
import Product from '../models/Product';

const router = Router();

// Create product
router.post('/', async (req, res) => {
  try {
    const { name, productCode, productType, sizes, price, locationIds, imageUrl } = req.body;
    if (!name || !productCode || !productType || !Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    const inventories = (locationIds || []).map((id: string) => ({ locationId: id, quantity: 0 }));
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

// Update inventory quantities for a product per location
router.patch('/:id/inventory', async (req, res) => {
  try {
    const { id } = req.params;
    const { locationId, quantity, quantities } = req.body;
    
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    // 支持批量更新（前端發送的格式）
    if (quantities && Array.isArray(quantities)) {
      for (const { locationId: locId, quantity: qty } of quantities) {
        if (typeof locId === 'string' && typeof qty === 'number') {
          const inv = product.inventories.find(i => String(i.locationId) === String(locId));
          if (inv) {
            inv.quantity = qty;
          } else {
            product.inventories.push({ locationId: locId, quantity: qty });
          }
        }
      }
    }
    // 支持單個更新（向後兼容）
    else if (locationId && typeof quantity === 'number') {
      const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
      if (inv) {
        inv.quantity = quantity;
      } else {
        product.inventories.push({ locationId, quantity });
      }
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
