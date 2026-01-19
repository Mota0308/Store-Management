import { Router } from "express";
import Product from "../models/Product";
import mongoose from "mongoose";

const router = Router();

// Create product
router.post("/", async (req, res) => {
  try {
    const { name, productCode, productType, sizes, price, points, locationIds, imageUrl } = req.body;
    if (!name || !productCode || !productType || !sizes) {
      return res.status(400).json({ message: "Missing fields" });
    }
    const inventories = (locationIds || []).map((id: string) => ({ locationId: new mongoose.Types.ObjectId(id), quantity: 0 }));
    // 設置默認價格為0，如果沒有提供價格
    const productPrice = typeof price === "number" ? price : 0;
    const productPoints = typeof points === "number" ? points : 0;
    
    console.log("創建商品 - 數據:", { name, productCode, productType, sizes, price: productPrice, points: productPoints, inventories });
    console.log("MongoDB 連接狀態:", mongoose.connection.readyState);
    console.log("數據庫名稱:", mongoose.connection.db?.databaseName);
    
    const product = await Product.create({ name, productCode, productType, sizes: Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []), price: productPrice, points: productPoints, imageUrl, inventories });
    console.log("商品創建成功:", product._id, product.name);
    
    // 強制刷新連接
    await mongoose.connection.db?.admin().ping();
    
    // 驗證商品是否真的保存到數據庫
    const savedProduct = await Product.findById(product._id);
    console.log("驗證保存的商品:", savedProduct ? "存在" : "不存在");
    
    res.status(201).json(product);
  } catch (e) {
    console.error("創建商品失敗:", e);
    res.status(500).json({ message: "Failed to create", error: String(e) });
  }
});

// List with search/filter/sort - 修復返回格式
router.get("/", async (req, res) => {
  try {
    const { q, productCode, productType, size, locationId, sortBy, sortOrder } = req.query as Record<string, string>;

    const filter: any = {};
    if (q) filter.$text = { $search: q };
    if (productCode) {
      // 使用正則表達式進行模糊匹配，支持子字符串搜索
      filter.productCode = { $regex: productCode, $options: "i" };
    }
    if (productType) filter.productType = productType;
    if (size) {
      filter.$or = [
        { size: size },
        { sizes: { $in: [size] } }
      ];
    }
    if (locationId) {
      filter["inventories.locationId"] = new mongoose.Types.ObjectId(locationId);
    }

    const sort: any = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sort.createdAt = -1; // 默認按創建時間倒序
    }

    // 移除分頁限制，獲取所有商品
    const products = await Product.find(filter)
      .sort(sort)
      .populate("inventories.locationId", "name");

    // 修復：直接返回產品數組，而不是包裝在對象中
    res.json(products);
  } catch (e) {
    console.error("查詢商品失敗:", e);
    res.status(500).json({ message: "Failed to fetch products", error: String(e) });
  }
});

// Get single product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("inventories.locationId", "name");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch product", error: String(e) });
  }
});

// Update product
router.put("/:id", async (req, res) => {
  try {
    const { name, productCode, productType, sizes, price, points, inventories, imageUrl } = req.body;
    
    console.log(`更新產品請求 - ID: ${req.params.id}`);
    console.log(`更新數據:`, { name, productCode, productType, sizes, price, points, inventories: inventories?.length, imageUrl });
    
    // 驗證必要字段
    if (!name || !productCode || !productType) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    // 處理庫存數據
    const processedInventories = (inventories || []).map((inv: any) => {
      let locationId;
      
      // 安全處理locationId
      if (typeof inv.locationId === "string" && inv.locationId.trim() !== "") {
        // 驗證字符串是否為有效的ObjectId格式
        if (mongoose.Types.ObjectId.isValid(inv.locationId)) {
          locationId = new mongoose.Types.ObjectId(inv.locationId);
        } else {
          console.warn(`Invalid locationId format: ${inv.locationId}, skipping this inventory`);
          return null; // 跳過無效的庫存記錄
        }
      } else if (inv.locationId && inv.locationId._id) {
        // 如果是對象形式，提取_id
        const idValue = typeof inv.locationId._id === "string" 
          ? inv.locationId._id 
          : inv.locationId._id.toString();
        
        if (mongoose.Types.ObjectId.isValid(idValue)) {
          locationId = new mongoose.Types.ObjectId(idValue);
        } else {
          console.warn(`Invalid locationId._id format: ${idValue}, skipping this inventory`);
          return null;
        }
      } else if (inv.locationId && mongoose.Types.ObjectId.isValid(inv.locationId)) {
        // 如果已經是有效的ObjectId
        locationId = inv.locationId;
      } else {
        console.warn(`Cannot process locationId: ${JSON.stringify(inv.locationId)}, skipping this inventory`);
        return null; // 跳過無效的庫存記錄
      }
      
      return {
        locationId,
        quantity: inv.quantity || 0
      };
    }).filter((inv: any) => inv !== null); // 過濾掉null值
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        productCode, 
        productType, 
        sizes: Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []), 
        price: price || 0,
        points: points !== undefined ? points : 0,
        inventories: processedInventories,
        imageUrl: imageUrl || ""
      },
      { new: true, runValidators: true }
    ).populate("inventories.locationId", "name");
    
    if (!product) {
      console.log(`產品更新失敗 - 找不到ID: ${req.params.id}`);
      return res.status(404).json({ message: "Product not found" });
    }
    
    console.log(`產品更新成功 - ID: ${product._id}, 庫存數量: ${product.inventories?.length}`);
    res.json(product);
  } catch (e) {
    console.error("更新商品失敗:", e);
    res.status(500).json({ message: "Failed to update product", error: String(e) });
  }
});

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (e) {
    res.status(500).json({ message: "Failed to delete product", error: String(e) });
  }
});

// Transfer products between locations
router.post("/transfer", async (req, res) => {
  try {
    const { productId, fromLocationId, toLocationId, quantity } = req.body;
    
    if (!productId || !fromLocationId || !toLocationId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Missing or invalid parameters" });
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // 查找來源地點的庫存
    const fromInventory = product.inventories.find(
      inv => String(inv.locationId) === String(fromLocationId)
    );
    
    if (!fromInventory || fromInventory.quantity < quantity) {
      return res.status(400).json({ message: "Insufficient inventory" });
    }
    
    // 查找目標地點的庫存
    let toInventory = product.inventories.find(
      inv => String(inv.locationId) === String(toLocationId)
    );
    
    if (!toInventory) {
      // 如果目標地點沒有庫存記錄，創建一個
      toInventory = {
        locationId: new mongoose.Types.ObjectId(toLocationId),
        quantity: 0
      };
      product.inventories.push(toInventory);
    }
    
    // 執行調貨
    fromInventory.quantity -= quantity;
    toInventory.quantity += quantity;
    
    await product.save();
    
    res.json({ message: "Transfer successful", product });
  } catch (e) {
    console.error("調貨失敗:", e);
    res.status(500).json({ message: "Failed to transfer product", error: String(e) });
  }
});

export default router;