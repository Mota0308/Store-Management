import { Router, Request, Response } from 'express';
import PointsCombo from '../models/PointsCombo';
import Product from '../models/Product';

const router = Router();

// 获取所有积分组合
router.get('/', async (req: Request, res: Response) => {
  try {
    const combos = await PointsCombo.find().sort({ createdAt: -1 });
    res.json(combos);
  } catch (error) {
    console.error('获取积分组合失败:', error);
    res.status(500).json({ error: '获取积分组合失败' });
  }
});

// 获取单个积分组合
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const combo = await PointsCombo.findById(req.params.id);
    if (!combo) {
      return res.status(404).json({ error: '积分组合不存在' });
    }
    res.json(combo);
  } catch (error) {
    console.error('获取积分组合失败:', error);
    res.status(500).json({ error: '获取积分组合失败' });
  }
});

// 创建积分组合
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, productCodes, comboPoints } = req.body;

    if (!name || !productCodes || !Array.isArray(productCodes) || productCodes.length === 0) {
      return res.status(400).json({ error: '请提供组合名称和产品型号列表' });
    }

    if (comboPoints === undefined || comboPoints < 0) {
      return res.status(400).json({ error: '请提供有效的组合积分' });
    }

    // 验证产品型号是否存在
    for (const code of productCodes) {
      const product = await Product.findOne({ productCode: code });
      if (!product) {
        return res.status(404).json({ error: `产品型号 ${code} 不存在` });
      }
    }

    const combo = await PointsCombo.create({
      name,
      description,
      productCodes,
      comboPoints
    });

    res.status(201).json(combo);
  } catch (error) {
    console.error('创建积分组合失败:', error);
    res.status(500).json({ error: '创建积分组合失败' });
  }
});

// 更新积分组合
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, productCodes, comboPoints } = req.body;

    if (productCodes && Array.isArray(productCodes)) {
      // 验证产品型号是否存在
      for (const code of productCodes) {
        const product = await Product.findOne({ productCode: code });
        if (!product) {
          return res.status(404).json({ error: `产品型号 ${code} 不存在` });
        }
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (comboPoints !== undefined) updateData.comboPoints = comboPoints;
    if (productCodes !== undefined) updateData.productCodes = productCodes;

    const combo = await PointsCombo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!combo) {
      return res.status(404).json({ error: '积分组合不存在' });
    }

    res.json(combo);
  } catch (error) {
    console.error('更新积分组合失败:', error);
    res.status(500).json({ error: '更新积分组合失败' });
  }
});

// 删除积分组合
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const combo = await PointsCombo.findByIdAndDelete(req.params.id);
    if (!combo) {
      return res.status(404).json({ error: '积分组合不存在' });
    }
    res.json({ message: '积分组合已删除' });
  } catch (error) {
    console.error('删除积分组合失败:', error);
    res.status(500).json({ error: '删除积分组合失败' });
  }
});

export default router;

