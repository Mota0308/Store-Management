# Railway 部署更新檢查清單

## ✅ 需要更新的內容

由於添加了用戶認證功能，需要在 Railway 上進行以下更新：

### 1. 環境變量更新

在 Railway 項目設置中添加新的環境變量：

**必須添加**：
```
JWT_SECRET=your-secret-key-change-in-production
```

**生成安全的 JWT_SECRET**（可選，但強烈建議）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

將生成的隨機字符串作為 `JWT_SECRET` 的值。

### 2. 現有環境變量

確保以下環境變量已設置：
```
NODE_ENV=production
PORT=4001
MONGODB_URI=mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=<你的隨機密鑰>
```

### 3. 代碼更新

確保所有新文件已提交到 Git 並推送到 GitHub：

**後端新增文件**：
- `server/src/models/User.ts`
- `server/src/routes/auth.ts`
- `server/src/middleware/auth.ts`

**前端新增文件**：
- `client/src/contexts/AuthContext.tsx`
- `client/src/pages/Login.tsx`
- `client/src/components/ProtectedRoute.tsx`

**更新的文件**：
- `server/src/index.ts` (添加了 auth 路由)
- `server/package.json` (新增依賴)
- `client/src/api.ts` (添加認證支持)
- `client/src/main.tsx` (添加認證路由)
- `client/src/pages/App.tsx` (添加登出功能)

### 4. 部署步驟

1. **提交代碼到 Git**：
   ```bash
   git add .
   git commit -m "Add user authentication system"
   git push
   ```

2. **在 Railway 上更新環境變量**：
   - 進入 Railway 項目設置
   - 找到 "Variables" 標籤
   - 添加 `JWT_SECRET` 環境變量
   - 保存更改

3. **觸發重新部署**：
   - Railway 會自動檢測到 Git 推送並開始重新部署
   - 或者手動點擊 "Redeploy" 按鈕

4. **等待部署完成**：
   - 查看部署日誌確保構建成功
   - 檢查是否有任何錯誤

### 5. 部署後測試

部署完成後，請測試以下功能：

1. ✅ 訪問網站，應該自動跳轉到登入頁面
2. ✅ 註冊新帳號
3. ✅ 使用註冊的帳號登入
4. ✅ 登入後可以訪問庫存和添加產品頁面
5. ✅ 測試登出功能
6. ✅ 登出後再次訪問應該重定向到登入頁面

### 6. 常見問題

**問題：部署後無法登入**
- 檢查 `JWT_SECRET` 環境變量是否正確設置
- 檢查 MongoDB 連接是否正常
- 查看 Railway 部署日誌中的錯誤信息

**問題：前端顯示錯誤**
- 檢查前端構建是否成功
- 確認所有新文件都已提交到 Git
- 檢查瀏覽器控制台的錯誤信息

**問題：API 請求失敗**
- 檢查後端服務是否正常運行
- 確認 API 路由已正確註冊
- 查看服務器日誌

## 📝 注意事項

- 首次部署後，需要註冊第一個管理員帳號
- 所有現有功能現在都需要登入才能訪問
- JWT token 有效期為 7 天
- 密碼使用 bcrypt 加密存儲

