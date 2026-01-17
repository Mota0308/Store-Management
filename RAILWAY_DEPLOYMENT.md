# Railway 部署指南

## 項目概述
這是一個庫存管理系統，包含前端（React + Vite）和後端（Node.js + Express + MongoDB）。

## 部署步驟

### 1. 準備 GitHub 倉庫
1. 將代碼推送到 GitHub 倉庫
2. 確保倉庫是公開的或您有權限訪問

### 2. 在 Railway 上創建項目
1. 訪問 [Railway.app](https://railway.app)
2. 使用您的 GitHub 賬號登錄
3. 點擊 "New Project"
4. 選擇 "Deploy from GitHub repo"
5. 選擇您的倉庫

### 3. 配置環境變量
在 Railway 項目設置中添加以下環境變量：

```
NODE_ENV=production
PORT=4001
MONGODB_URI=mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=your-secret-key-change-in-production
```

**重要提示**：
- `JWT_SECRET` 用於 JWT token 的簽名和驗證，請使用一個強隨機字符串
- 建議使用至少 32 個字符的隨機字符串
- 可以使用以下命令生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 4. 配置構建設置
Railway 會自動檢測到這是一個 Node.js 項目，並使用以下設置：
- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Health Check Path**: `/api/locations`

### 5. 部署
1. Railway 會自動開始構建和部署
2. 等待構建完成（通常需要 2-5 分鐘）
3. 部署完成後，您會獲得一個公開的 URL

## 項目結構
```
Project_Q/
 client/                 # 前端 React 應用
    src/
       pages/         # 頁面組件
       api.ts         # API 配置
       main.tsx       # 入口文件
    package.json
    vite.config.ts
 server/                # 後端 Node.js 應用
    src/
       routes/        # API 路由
       models/        # 數據模型
       index.ts       # 服務器入口
    package.json
 package.json           # 根目錄配置
 Dockerfile            # Docker 配置
 railway.json          # Railway 配置
```

## 功能特點
-  用戶認證系統（註冊、登入、登出）
-  產品管理（添加、編輯、刪除）
-  庫存管理（多門市庫存追蹤）
-  PDF 導入功能（進貨/出貨）
-  產品類型管理
-  響應式設計
-  圖片上傳功能

## 技術棧
- **前端**: React 18, TypeScript, Vite, Axios
- **後端**: Node.js, Express, TypeScript
- **數據庫**: MongoDB Atlas
- **部署**: Railway
- **認證**: JWT (jsonwebtoken), bcrypt
- **文件上傳**: Multer
- **PDF 處理**: pdf-parse, pdfjs-dist

## 注意事項
1. 確保 MongoDB Atlas 數據庫允許來自 Railway 的連接
2. 生產環境中前端和後端運行在同一個端口
3. 所有 API 請求會自動路由到 `/api` 路徑
4. 靜態文件由 Express 服務器提供
5. **首次部署後，需要註冊一個管理員帳號才能使用系統**
6. 所有需要認證的頁面會自動重定向到登入頁面

## 故障排除
如果部署失敗，請檢查：
1. 環境變量是否正確設置
2. MongoDB 連接字符串是否有效
3. 構建日誌中的錯誤信息
4. Railway 服務狀態

## 支持
如有問題，請檢查 Railway 的部署日誌或聯繫開發者。
