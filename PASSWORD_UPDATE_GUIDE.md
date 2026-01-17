# 修改用戶密碼指南

## 方法一：修改單個用戶密碼

### 本地數據庫

```bash
cd server
node update_user_password.js --username admin --password newpassword123
```

或使用簡寫：
```bash
node update_user_password.js -u admin -n newpassword123
```

### 生產數據庫（Railway）

```bash
cd server
node update_user_password.js --production --username admin --password newpassword123
```

或使用簡寫：
```bash
node update_user_password.js --prod -u admin -n newpassword123
```

### 使用 npm 腳本

```bash
# 本地數據庫
cd server
npm run update-password -- --username admin --password newpassword123

# 生產數據庫
cd server
npm run update-password:prod -- --username admin --password newpassword123
```

## 方法二：批量更新所有測試賬號密碼

### 本地數據庫

```bash
cd server
node update_all_passwords.js
```

### 生產數據庫

```bash
cd server
node update_all_passwords.js --production
```

**注意**: 在運行批量更新前，請先編輯 `server/update_all_passwords.js` 文件，修改 `usersToUpdate` 數組中的密碼。

## 參數說明

### update_user_password.js

- `--username` 或 `-u`: 要修改密碼的用戶名或郵箱
- `--password` 或 `--new-password` 或 `-n`: 新密碼（至少6個字符）
- `--production` 或 `--prod`: 使用生產數據庫（Railway）

### update_all_passwords.js

- `--production` 或 `--prod`: 使用生產數據庫（Railway）

## 示例

### 修改 admin 用戶密碼為 "newadmin123"

**本地數據庫**:
```bash
cd server
node update_user_password.js -u admin -n newadmin123
```

**生產數據庫**:
```bash
cd server
node update_user_password.js --prod -u admin -n newadmin123
```

### 修改 testuser 用戶密碼為 "newtest123"

**本地數據庫**:
```bash
cd server
node update_user_password.js -u testuser -n newtest123
```

**生產數據庫**:
```bash
cd server
node update_user_password.js --prod -u testuser -n newtest123
```

## 注意事項

1. **密碼長度**: 新密碼必須至少6個字符
2. **用戶存在**: 如果用戶不存在，腳本會顯示錯誤信息
3. **密碼加密**: 密碼會自動使用 bcrypt 加密存儲
4. **數據庫連接**: 確保數據庫連接正常，特別是生產數據庫

## 安全建議

1. 使用強密碼（至少12個字符，包含大小寫字母、數字和特殊字符）
2. 定期更換密碼
3. 不要在代碼中硬編碼密碼
4. 使用環境變量存儲敏感信息

## 故障排除

### 錯誤: 找不到用戶

**原因**: 用戶名或郵箱不存在

**解決方法**: 
- 確認用戶名或郵箱正確
- 使用 `create_test_users.js` 創建用戶

### 錯誤: 密碼長度不足

**原因**: 新密碼少於6個字符

**解決方法**: 使用至少6個字符的密碼

### 錯誤: 數據庫連接失敗

**原因**: MongoDB 連接字符串錯誤或數據庫不可訪問

**解決方法**:
- 檢查 `local.env` 文件中的 `MONGODB_URI` 或 `RAILWAY_MONGODB_URI`
- 確認數據庫服務正在運行
- 檢查網絡連接

