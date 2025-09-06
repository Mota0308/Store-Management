# 庫存管理系統

一個功能完整的庫存管理系統，支持多門市庫存追蹤、產品管理、PDF導入等功能。

## 功能特點

-  **多門市管理** - 支持多個門市地點的庫存管理
-  **產品管理** - 添加、編輯、刪除產品信息
-  **庫存追蹤** - 實時庫存數量管理和修改
-  **PDF導入** - 支持PDF文件批量導入庫存（進貨/出貨）
-  **產品類型** - 靈活的產品類型管理系統
-  **圖片上傳** - 產品圖片上傳和顯示
-  **響應式設計** - 適配各種設備屏幕

## 技術棧

- **前端**: React 18, TypeScript, Vite, Axios
- **後端**: Node.js, Express, TypeScript
- **數據庫**: MongoDB Atlas
- **部署**: Railway
- **文件處理**: Multer, pdf-parse, pdfjs-dist

## 快速開始

### 本地開發

1. 克隆倉庫
```bash
git clone <your-repo-url>
cd Project_Q
```

2. 安裝依賴
```bash
npm run install:all
```

3. 啟動開發服務器
```bash
npm run dev
```

4. 訪問應用
- 前端: http://localhost:5173
- 後端: http://localhost:4001

### 生產部署

請參考 [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) 了解詳細的部署步驟。

## 項目結構

```
Project_Q/
 client/                 # 前端 React 應用
    src/
       pages/         # 頁面組件
       api.ts         # API 配置
       main.tsx       # 入口文件
    package.json
 server/                # 後端 Node.js 應用
    src/
       routes/        # API 路由
       models/        # 數據模型
       index.ts       # 服務器入口
    package.json
 package.json           # 根目錄配置
 Dockerfile            # Docker 配置
 railway.json          # Railway 配置
 README.md             # 項目說明
```

## API 端點

### 產品管理
- `GET /api/products` - 獲取產品列表
- `POST /api/products` - 創建新產品
- `PATCH /api/products/:id/inventory` - 更新庫存

### 門市管理
- `GET /api/locations` - 獲取門市列表

### 產品類型
- `GET /api/product-types` - 獲取產品類型
- `POST /api/product-types/batch` - 批量創建產品類型
- `DELETE /api/product-types/:id` - 刪除產品類型

### 文件處理
- `POST /api/upload` - 上傳圖片
- `POST /api/import/incoming` - 進貨導入
- `POST /api/import/outgoing` - 出貨導入

## 環境變量

```env
NODE_ENV=production
PORT=4001
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

## 開發者

- GitHub: chenyaolin0308@gmail.com
- 項目類型: 庫存管理系統

## 許可證

此項目僅供學習和個人使用。
