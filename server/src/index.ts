import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'path';

import productsRouter from './routes/products';
import locationsRouter from './routes/locations';
import importRouter from './routes/imports';
import uploadRouter from './routes/upload';
import productTypesRouter from './routes/productTypes';
import Location from './models/Location';

dotenv.config({ path: path.resolve(__dirname, '..', 'local.env') });

const app = express();

// 增加請求超時設置
app.use((req, res, next) => {
  // 為Excel導入設置更長的超時時間（15分鐘）
  if (req.path === '/api/import/excel') {
    req.setTimeout(900000); // 15分鐘
    res.setTimeout(900000); // 15分鐘
  }
  next();
});

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// 在生產環境中提供靜態文件
if (process.env.NODE_ENV === 'production') {
  // 提供前端構建文件
  app.use(express.static(path.resolve(__dirname, '..', '..', 'client', 'dist')));
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Storage';

async function seedLocations() {
  // 確保所有門市都存在（按照正確順序）
  const names = ['觀塘', '灣仔', '荔枝角', '元朗', '元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉', '屯門', '國内倉'];
  for (const name of names) {
    const existing = await Location.findOne({ name });
    if (!existing) {
      await Location.create({ name });
      console.log(`Created location: ${name}`);
    }
  }
}

async function migrateAtoProductsIfNeeded() {
  const Product = (await import('./models/Product')).default;
  const products = await Product.find({ productType: 'A' });
  if (products.length > 0) {
    console.log(`Found ${products.length} products with type 'A', migrating to '保暖'`);
    await Product.updateMany({ productType: 'A' }, { productType: '保暖' });
    console.log('Migration completed');
  }
}

async function boot(port: number, attempts = 5) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      resolve(server);
    });

    server.on('error', async (err: any) => {
      if (err.code === 'EADDRINUSE' && attempts > 0) {
        console.log(`Port ${port} in use, retrying on ${port + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        boot(port + 1, attempts - 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

async function start() {
  try {
    console.log('正在連接 MongoDB...');
    console.log('MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@')); // 隱藏密碼
    
    await mongoose.connect(MONGODB_URI, { 
      dbName: 'Storage',
      maxPoolSize: 10, // 最大連接池大小
      serverSelectionTimeoutMS: 5000, // 服務器選擇超時
      socketTimeoutMS: 45000, // Socket超時
    });
    console.log('MongoDB 連接成功');
    console.log('數據庫名稱:', mongoose.connection.db?.databaseName);
    console.log('MongoDB 連接狀態:', mongoose.connection.readyState);
    
    // 監聽連接事件
    mongoose.connection.on('connected', () => {
      console.log('MongoDB 連接已建立');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB 連接錯誤:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB 連接已斷開');
    });

    await seedLocations();
    await migrateAtoProductsIfNeeded();

    app.use('/api/products', productsRouter);
    app.use('/api/locations', locationsRouter);
    app.use('/api/import', importRouter);
    app.use('/api/upload', uploadRouter);
    app.use('/api/product-types', productTypesRouter);

    // 在生產環境中，所有非API路由都返回index.html（SPA路由）
    if (process.env.NODE_ENV === 'production') {
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '..', '..', 'client', 'dist', 'index.html'));
      });
    }

    const basePort = parseInt(process.env.PORT || '4001', 10);
    await boot(basePort);
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();


