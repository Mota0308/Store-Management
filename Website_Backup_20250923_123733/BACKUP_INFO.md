# 網站代碼備份信息

## 備份詳情
- **備份時間**: 2025年09月23日 12:37:33
- **備份類型**: 完整代碼備份
- **備份來源**: Project_Q 庫存管理系統

## 備份內容

### 1. 前端應用 (client/)
- **框架**: React + TypeScript + Vite
- **主要組件**:
  - `src/pages/App.tsx` - 主應用組件（包含手機導航）
  - `src/pages/Inventory.tsx` - 庫存管理頁面
  - `src/pages/AddProduct.tsx` - 添加產品頁面
  - `src/api.ts` - API 接口配置

- **樣式文件**:
  - `src/styles.css` - 主要樣式（包含響應式設計）
  - `src/mobile-table.css` - 手機表格專用樣式
  - `src/responsive-table.css` - 響應式表格樣式

- **配置文件**:
  - `package.json` - 前端依賴管理
  - `tsconfig.json` - TypeScript 配置
  - `vite.config.ts` - Vite 構建配置
  - `postcss.config.js` - PostCSS 配置

### 2. 後端應用 (server/)
- **框架**: Node.js + Express + TypeScript
- **主要路由**:
  - `src/routes/products.ts` - 產品管理 API
  - `src/routes/locations.ts` - 門市位置 API
  - `src/routes/imports.ts` - PDF 導入功能
  - `src/routes/productTypes.ts` - 產品類型管理
  - `src/routes/upload.ts` - 文件上傳功能

- **數據模型**:
  - `src/models/Product.ts` - 產品數據模型
  - `src/models/Location.ts` - 門市位置模型

- **配置文件**:
  - `package.json` - 後端依賴管理
  - `tsconfig.json` - TypeScript 配置
  - `src/index.ts` - 服務器入口文件

### 3. 配置和部署文件
- `Dockerfile` - Docker 容器配置
- `.gitignore` - Git 忽略文件配置
- `README.md` - 項目說明文檔
- `RAILWAY_DEPLOYMENT.md` - Railway 部署說明

## 主要功能特點

### 響應式設計
- ✅ 桌面端優化 (>1024px)
- ✅ 平板端適配 (769px - 1024px)
- ✅ 手機端優化 (<768px)
- ✅ 觸摸友好的交互設計

### 核心功能
- ✅ 庫存管理和編輯
- ✅ 產品添加和刪除
- ✅ PDF 發票導入解析
- ✅ Excel 報表導出
- ✅ 門市位置管理
- ✅ 產品類型分類
- ✅ 實時數據更新

### 技術棧
- **前端**: React 18, TypeScript, Vite, Axios
- **後端**: Node.js, Express, TypeScript, MongoDB
- **樣式**: CSS3, 響應式設計, 移動優先
- **部署**: Docker, Railway Platform

## 備份完整性
此備份包含了運行完整庫存管理系統所需的所有核心代碼文件，包括：
- ✅ 所有源代碼文件
- ✅ 配置文件
- ✅ 樣式表和資源
- ✅ 類型定義文件
- ✅ 構建配置
- ✅ 部署文檔

## 恢復說明
1. 將備份文件夾複製到目標位置
2. 在 client 和 server 目錄分別運行 `npm install`
3. 配置環境變量和數據庫連接
4. 運行 `npm run dev` 啟動開發服務器

---
*此備份由自動化腳本生成於 2025-09-23* 