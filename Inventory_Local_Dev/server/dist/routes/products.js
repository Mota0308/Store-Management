"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Product_1 = __importDefault(require("../models/Product"));
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
// Create product
router.post('/', async (req, res) => {
    try {
        const { name, productCode, productType, sizes, price, locationIds, imageUrl } = req.body;
        if (!name || !productCode || !productType || !Array.isArray(sizes) || sizes.length === 0) {
            return res.status(400).json({ message: 'Missing fields' });
        }
        const inventories = (locationIds || []).map((id) => ({ locationId: new mongoose_1.default.Types.ObjectId(id), quantity: 0 }));
        // 設置默認價格為0，如果沒有提供價格
        const productPrice = typeof price === 'number' ? price : 0;
        console.log('創建商品 - 數據:', { name, productCode, productType, sizes, price: productPrice, inventories });
        console.log('MongoDB 連接狀態:', mongoose_1.default.connection.readyState);
        console.log('數據庫名稱:', mongoose_1.default.connection.db?.databaseName);
        const product = await Product_1.default.create({ name, productCode, productType, sizes, price: productPrice, imageUrl, inventories });
        console.log('商品創建成功:', product._id, product.name);
        // 強制刷新連接
        await mongoose_1.default.connection.db?.admin().ping();
        // 驗證商品是否真的保存到數據庫
        const savedProduct = await Product_1.default.findById(product._id);
        console.log('驗證保存的商品:', savedProduct ? '存在' : '不存在');
        res.status(201).json(product);
    }
    catch (e) {
        console.error('創建商品失敗:', e);
        res.status(500).json({ message: 'Failed to create', error: String(e) });
    }
});
// List with search/filter/sort - 移除分頁限制
router.get('/', async (req, res) => {
    try {
        const { q, productCode, productType, size, locationId, sortBy, sortOrder } = req.query;
        const filter = {};
        if (q)
            filter.$text = { $search: q };
        if (productCode) {
            // 使用正則表達式進行模糊匹配，支持子字符串搜索
            filter.productCode = { $regex: productCode, $options: 'i' };
        }
        if (productType)
            filter.productType = productType;
        if (size) {
            filter.$or = [
                { size: size },
                { sizes: { $in: [size] } }
            ];
        }
        if (locationId) {
            filter['inventories.locationId'] = new mongoose_1.default.Types.ObjectId(locationId);
        }
        const sort = {};
        if (sortBy) {
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        }
        else {
            sort.createdAt = -1; // 默認按創建時間倒序
        }
        // 移除分頁限制，獲取所有商品
        const products = await Product_1.default.find(filter)
            .sort(sort)
            .populate('inventories.locationId', 'name');
        const total = await Product_1.default.countDocuments(filter);
        res.json({
            products,
            pagination: {
                page: 1,
                limit: total,
                total,
                pages: 1
            }
        });
    }
    catch (e) {
        console.error('查詢商品失敗:', e);
        res.status(500).json({ message: 'Failed to fetch products', error: String(e) });
    }
});
// Get single product
router.get('/:id', async (req, res) => {
    try {
        const product = await Product_1.default.findById(req.params.id).populate('inventories.locationId', 'name');
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(product);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to fetch product', error: String(e) });
    }
});
// Update inventory
router.patch('/:id/inventory', async (req, res) => {
    try {
        const { locationId, quantity, quantities } = req.body;
        const product = await Product_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // 支持批量更新（新功能）
        if (quantities && Array.isArray(quantities)) {
            for (const { locationId: locId, quantity: qty } of quantities) {
                if (locId && typeof qty === 'number') {
                    const inv = product.inventories.find(i => String(i.locationId) === String(locId));
                    if (inv) {
                        inv.quantity = qty;
                    }
                    else {
                        product.inventories.push({ locationId: new mongoose_1.default.Types.ObjectId(locId), quantity: qty });
                    }
                }
            }
        }
        // 支持單個更新（向後兼容）
        else if (locationId && typeof quantity === 'number') {
            const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
            if (inv)
                inv.quantity = quantity;
            else
                product.inventories.push({ locationId: new mongoose_1.default.Types.ObjectId(locationId), quantity });
        }
        else {
            return res.status(400).json({ message: 'locationId and quantity are required, or quantities array for batch update' });
        }
        await product.save();
        res.json(product);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to update inventory', error: String(e) });
    }
});
// Update product
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, productCode, productType, size, price, inventories } = req.body;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }
        const product = await Product_1.default.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // 更新產品基本信息
        if (name !== undefined)
            product.name = name;
        if (productCode !== undefined)
            product.productCode = productCode;
        if (productType !== undefined)
            product.productType = productType;
        if (size !== undefined)
            product.sizes = size;
        if (price !== undefined)
            product.price = price;
        // 更新庫存信息
        if (inventories && Array.isArray(inventories)) {
            product.inventories = inventories.map((inv) => ({
                locationId: new mongoose_1.default.Types.ObjectId(inv.locationId),
                quantity: inv.quantity
            }));
        }
        await product.save();
        res.json(product);
    }
    catch (e) {
        console.error('更新商品失敗:', e);
        res.status(500).json({ message: 'Failed to update product', error: String(e) });
    }
});
// Delete product
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }
        const product = await Product_1.default.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        await Product_1.default.findByIdAndDelete(id);
        res.json({ message: 'Product deleted successfully' });
    }
    catch (e) {
        console.error('刪除商品失敗:', e);
        res.status(500).json({ message: 'Failed to delete product', error: String(e) });
    }
});
exports.default = router;
