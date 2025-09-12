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

dotenv.config();

const app = express();
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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

async function seedLocations() {
  // 刪除屯門數據
  await Location.deleteMany({ name: '屯門' });
  console.log('已刪除屯門數據');
  
  const names = ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉'];
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
    
    await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
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


