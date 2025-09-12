"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
const products_1 = __importDefault(require("./routes/products"));
const locations_1 = __importDefault(require("./routes/locations"));
const imports_1 = __importDefault(require("./routes/imports"));
const upload_1 = __importDefault(require("./routes/upload"));
const productTypes_1 = __importDefault(require("./routes/productTypes"));
const Location_1 = __importDefault(require("./models/Location"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.resolve(__dirname, '..', 'uploads')));
// 在生產環境中提供靜態文件
if (process.env.NODE_ENV === 'production') {
    // 提供前端構建文件
    app.use(express_1.default.static(path_1.default.resolve(__dirname, '..', '..', 'client', 'dist')));
}
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';
async function seedLocations() {
    // 刪除屯門數據
    await Location_1.default.deleteMany({ name: '屯門' });
    console.log('已刪除屯門數據');
    const names = ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉'];
    for (const name of names) {
        const existing = await Location_1.default.findOne({ name });
        if (!existing) {
            await Location_1.default.create({ name });
            console.log(`Created location: ${name}`);
        }
    }
}
async function migrateAtoProductsIfNeeded() {
    const Product = (await Promise.resolve().then(() => __importStar(require('./models/Product')))).default;
    const products = await Product.find({ productType: 'A' });
    if (products.length > 0) {
        console.log(`Found ${products.length} products with type 'A', migrating to '保暖'`);
        await Product.updateMany({ productType: 'A' }, { productType: '保暖' });
        console.log('Migration completed');
    }
}
async function boot(port, attempts = 5) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            resolve(server);
        });
        server.on('error', async (err) => {
            if (err.code === 'EADDRINUSE' && attempts > 0) {
                console.log(`Port ${port} in use, retrying on ${port + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                boot(port + 1, attempts - 1).then(resolve).catch(reject);
            }
            else {
                reject(err);
            }
        });
    });
}
async function start() {
    try {
        console.log('正在連接 MongoDB...');
        console.log('MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@')); // 隱藏密碼
        await mongoose_1.default.connect(MONGODB_URI, { dbName: 'Storage' });
        console.log('MongoDB 連接成功');
        console.log('數據庫名稱:', mongoose_1.default.connection.db?.databaseName);
        console.log('MongoDB 連接狀態:', mongoose_1.default.connection.readyState);
        // 監聽連接事件
        mongoose_1.default.connection.on('connected', () => {
            console.log('MongoDB 連接已建立');
        });
        mongoose_1.default.connection.on('error', (err) => {
            console.error('MongoDB 連接錯誤:', err);
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.log('MongoDB 連接已斷開');
        });
        await seedLocations();
        await migrateAtoProductsIfNeeded();
        app.use('/api/products', products_1.default);
        app.use('/api/locations', locations_1.default);
        app.use('/api/import', imports_1.default);
        app.use('/api/upload', upload_1.default);
        app.use('/api/product-types', productTypes_1.default);
        // 在生產環境中，所有非API路由都返回index.html（SPA路由）
        if (process.env.NODE_ENV === 'production') {
            app.get('*', (req, res) => {
                res.sendFile(path_1.default.resolve(__dirname, '..', '..', 'client', 'dist', 'index.html'));
            });
        }
        const basePort = parseInt(process.env.PORT || '4001', 10);
        await boot(basePort);
    }
    catch (err) {
        console.error('Failed to start server', err);
        process.exit(1);
    }
}
start();
