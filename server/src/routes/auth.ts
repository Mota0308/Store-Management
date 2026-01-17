import express, { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth';

const router = express.Router();

// 註冊
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // 驗證輸入
    if (!username || !email || !password) {
      res.status(400).json({ error: '請提供用戶名、電子郵件和密碼' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: '密碼長度至少需要6個字符' });
      return;
    }

    // 檢查用戶是否已存在
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      res.status(400).json({ error: '用戶名或電子郵件已被使用' });
      return;
    }

    // 創建新用戶
    const user = new User({ username, email, password });
    await user.save();

    // 生成 JWT Token
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '註冊成功',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error: any) {
    console.error('註冊錯誤:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: '用戶名或電子郵件已被使用' });
      return;
    }
    res.status(500).json({ error: '註冊過程中發生錯誤' });
  }
});

// 登入
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    // 驗證輸入
    if (!username || !password) {
      res.status(400).json({ error: '請提供用戶名和密碼' });
      return;
    }

    // 檢查 JWT_SECRET 是否設置
    if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-change-in-production') {
      console.error('警告: JWT_SECRET 未正確設置');
    }

    // 查找用戶（支持用戶名或電子郵件登入）
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (!user) {
      console.log(`登入失敗: 用戶不存在 - ${username}`);
      res.status(401).json({ error: '用戶名或密碼錯誤' });
      return;
    }

    // 驗證密碼
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      console.log(`登入失敗: 密碼錯誤 - ${username}`);
      res.status(401).json({ error: '用戶名或密碼錯誤' });
      return;
    }

    // 生成 JWT Token
    try {
      const token = jwt.sign(
        { userId: user._id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(`登入成功: ${username}`);
      res.json({
        message: '登入成功',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email
        }
      });
    } catch (jwtError) {
      console.error('JWT 生成錯誤:', jwtError);
      res.status(500).json({ error: '生成認證令牌時發生錯誤' });
    }
  } catch (error) {
    console.error('登入錯誤:', error);
    res.status(500).json({ error: '登入過程中發生錯誤' });
  }
});

// 獲取當前用戶信息
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: '未提供認證令牌' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      res.status(404).json({ error: '用戶不存在' });
      return;
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: '無效的認證令牌' });
      return;
    }
    res.status(500).json({ error: '獲取用戶信息時發生錯誤' });
  }
});

export default router;

