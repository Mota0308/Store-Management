# 登录问题排查指南

## 401 错误常见原因

### 1. JWT_SECRET 未设置

**症状**: 登录返回 401，服务器日志显示 "JWT_SECRET 未正確設置"

**解决方法**:
1. 在 Railway 项目设置中添加环境变量 `JWT_SECRET`
2. 使用之前生成的密钥: `1b53644a3dff6aefe1992859e7ef56f76365f938f620442d3f26d58b83b3ceec`
3. 或者生成新的密钥:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### 2. 用户名或密码错误

**症状**: 登录返回 401，错误信息为 "用戶名或密碼錯誤"

**解决方法**:
- 确认使用正确的测试账号:
  - 用户名: `admin`, 密码: `admin123`
  - 用户名: `testuser`, 密码: `test123`
  - 用户名: `manager`, 密码: `manager123`
- 或者使用邮箱登录:
  - 邮箱: `admin@example.com`, 密码: `admin123`

### 3. 用户不存在

**症状**: 登录返回 401，服务器日志显示 "用戶不存在"

**解决方法**:
1. 在生产数据库创建测试账号:
   ```bash
   cd server
   npm run create-users:prod
   ```

### 4. 数据库连接问题

**症状**: 登录返回 500 或连接超时

**解决方法**:
1. 检查 Railway 上的 `MONGODB_URI` 环境变量是否正确
2. 检查 MongoDB Atlas 网络访问设置
3. 查看 Railway 部署日志

## 测试步骤

1. **检查环境变量**:
   - 登录 Railway 控制台
   - 进入项目设置 → Variables
   - 确认 `JWT_SECRET` 已设置

2. **检查测试账号**:
   - 运行 `npm run create-users:prod` 创建测试账号
   - 确认账号已成功创建

3. **测试登录**:
   - 访问网站登录页面
   - 使用测试账号登录
   - 查看浏览器控制台的错误信息
   - 查看 Railway 部署日志

## 调试技巧

### 查看服务器日志

在 Railway 控制台查看部署日志，查找：
- "登入成功" - 登录成功
- "登入失敗" - 登录失败及原因
- "JWT_SECRET 未正確設置" - 环境变量问题

### 查看浏览器控制台

检查：
- API 请求的 URL 和状态码
- 响应数据内容
- 错误信息

### 测试 API 端点

使用 curl 或 Postman 测试:
```bash
curl -X POST https://your-railway-url.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## 常见错误信息

| 错误信息 | 原因 | 解决方法 |
|---------|------|---------|
| "請提供用戶名和密碼" | 请求体缺少字段 | 检查前端表单提交 |
| "用戶名或密碼錯誤" | 用户名不存在或密码错误 | 使用正确的测试账号 |
| "生成認證令牌時發生錯誤" | JWT_SECRET 未设置 | 在 Railway 设置 JWT_SECRET |
| "登入過程中發生錯誤" | 服务器内部错误 | 查看服务器日志 |

## 联系支持

如果问题仍然存在，请提供：
1. Railway 部署日志
2. 浏览器控制台错误信息
3. 使用的登录凭据（隐藏密码）
4. 环境变量设置截图

