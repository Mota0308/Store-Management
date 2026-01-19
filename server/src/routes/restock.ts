import { Router, Request, Response } from 'express';
import RestockSetting from '../models/RestockSetting';
import Product from '../models/Product';
import Location from '../models/Location';
import { authenticate, AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';

const router = Router();

// 設置補貨提醒閾值
router.post('/threshold', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, locationId, threshold } = req.body;
    const userId = req.user!.id;

    if (!productId || !locationId || threshold === undefined) {
      return res.status(400).json({ error: '請提供產品ID、地點ID和閾值' });
    }

    if (typeof threshold !== 'number' || threshold < 0) {
      return res.status(400).json({ error: '閾值必須是非負數' });
    }

    const setting = await RestockSetting.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        productId: new mongoose.Types.ObjectId(productId),
        locationId: new mongoose.Types.ObjectId(locationId)
      },
      {
        userId: new mongoose.Types.ObjectId(userId),
        productId: new mongoose.Types.ObjectId(productId),
        locationId: new mongoose.Types.ObjectId(locationId),
        threshold,
        isRestocked: false,
        $unset: { restockedAt: 1 }
      },
      { upsert: true, new: true }
    );

    res.json({ message: '補貨提醒設置成功', setting });
  } catch (error) {
    console.error('設置補貨提醒失敗:', error);
    res.status(500).json({ error: '設置補貨提醒失敗' });
  }
});

// 獲取當前用戶的補貨設置
router.get('/settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const settings = await RestockSetting.find({
      userId: new mongoose.Types.ObjectId(userId)
    })
      .populate('productId', 'name productCode')
      .populate('locationId', 'name');

    res.json(settings);
  } catch (error) {
    console.error('獲取補貨設置失敗:', error);
    res.status(500).json({ error: '獲取補貨設置失敗' });
  }
});

// 獲取需要補貨的產品列表
router.get('/needed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // 獲取用戶的所有補貨設置
    const settings = await RestockSetting.find({
      userId: new mongoose.Types.ObjectId(userId),
      isRestocked: false
    })
      .populate('productId')
      .populate('locationId', 'name');

    const neededItems: any[] = [];

    for (const setting of settings) {
      const product = setting.productId as any;
      if (!product) continue;

      // 查找該產品在該地點的庫存
      const inventory = product.inventories?.find((inv: any) => {
        const locId = inv.locationId?._id || inv.locationId;
        return locId && locId.toString() === (setting.locationId as any)._id.toString();
      });

      const currentQuantity = inventory?.quantity || 0;

      // 如果當前庫存 <= 閾值，則需要補貨
      if (currentQuantity <= setting.threshold) {
        neededItems.push({
          settingId: setting._id,
          productId: product._id,
          productCode: product.productCode,
          productName: product.name,
          locationName: (setting.locationId as any).name,
          currentQuantity,
          threshold: setting.threshold
        });
      }
    }

    res.json(neededItems);
  } catch (error) {
    console.error('獲取需要補貨列表失敗:', error);
    res.status(500).json({ error: '獲取需要補貨列表失敗' });
  }
});

// 標記為已補貨
router.post('/restocked/:settingId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { settingId } = req.params;
    const userId = req.user!.id;

    const setting = await RestockSetting.findOne({
      _id: new mongoose.Types.ObjectId(settingId),
      userId: new mongoose.Types.ObjectId(userId)
    });

    if (!setting) {
      return res.status(404).json({ error: '補貨設置不存在' });
    }

    setting.isRestocked = true;
    setting.restockedAt = new Date();
    await setting.save();

    res.json({ message: '已標記為補貨', setting });
  } catch (error) {
    console.error('標記補貨失敗:', error);
    res.status(500).json({ error: '標記補貨失敗' });
  }
});

// 批量標記為已補貨
router.post('/restocked/batch', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { settingIds } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(settingIds) || settingIds.length === 0) {
      return res.status(400).json({ error: '請提供設置ID數組' });
    }

    const result = await RestockSetting.updateMany(
      {
        _id: { $in: settingIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId)
      },
      {
        isRestocked: true,
        restockedAt: new Date()
      }
    );

    res.json({ message: `已標記 ${result.modifiedCount} 個為已補貨` });
  } catch (error) {
    console.error('批量標記補貨失敗:', error);
    res.status(500).json({ error: '批量標記補貨失敗' });
  }
});

export default router;

