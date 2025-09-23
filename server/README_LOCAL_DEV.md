# 本地開發環境設置

## 前置條件

1. **安裝MongoDB**
   - 下載：https://www.mongodb.com/try/download/community
   - Windows：安裝後運行 `net start mongodb`
   - 或使用Docker：`docker run -d -p 27017:27017 --name mongodb mongo`

2. **安裝依賴**
   ```bash
   npm install
   ```

## 數據庫設置

1. **遷移數據**
   ```bash
   node migrate_database.js
   ```

2. **啟動本地服務器**
   ```bash
   npm run dev:local
   ```

## 測試功能

1. **測試門市對調**
   ```bash
   node test_transfer_complete.js
   ```

## 數據庫連接

- **本地**: `mongodb://localhost:27017/Storage_Local`
- **生產**: Railway MongoDB (自動)

## 注意事項

- 本地開發使用獨立的數據庫，不會影響生產環境
- 數據遷移會覆蓋本地數據庫的所有內容
- 測試完成後可以重新遷移以重置數據
