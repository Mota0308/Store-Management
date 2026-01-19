# Railway 环境变量设置指南

## 🚀 自动部署已完成

代码已成功提交并推送到 GitHub。Railway 应该会自动检测到更改并开始重新部署。

## ⚠️ 重要：必须设置 JWT_SECRET 环境变量

在 Railway 部署完成之前，您需要在 Railway 项目设置中添加 `JWT_SECRET` 环境变量。

### 步骤：

1. **登录 Railway**
   - 访问 https://railway.app
   - 登录您的账号

2. **进入项目设置**
   - 选择您的项目
   - 点击 "Variables" 标签

3. **添加环境变量**
   - 点击 "New Variable"
   - 变量名：`JWT_SECRET`
   - 变量值：`1b53644a3dff6aefe1992859e7ef56f76365f938f620442d3f26d58b83b3ceec`
   - 点击 "Add"

4. **确认现有环境变量**
   确保以下环境变量已设置：
   ```
   NODE_ENV=production
   PORT=4001
   MONGODB_URI=mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0
   JWT_SECRET=1b53644a3dff6aefe1992859e7ef56f76365f938f620442d3f26d58b83b3ceec
   ```

5. **触发重新部署**（如果需要）
   - 添加环境变量后，Railway 会自动重新部署
   - 或者点击 "Redeploy" 按钮手动触发

## 📋 部署检查清单

- [x] 代码已提交到 Git
- [x] 代码已推送到 GitHub
- [ ] JWT_SECRET 环境变量已添加到 Railway
- [ ] Railway 部署已完成
- [ ] 测试登录功能

## 🧪 部署后测试

部署完成后，请访问您的网站并测试：

1. ✅ 访问网站，应该自动跳转到登录页面
2. ✅ 点击"註冊"创建新账号
3. ✅ 使用注册的账号登录
4. ✅ 登录后可以访问库存和添加产品页面
5. ✅ 测试登出功能

## 🔐 安全提示

- JWT_SECRET 是一个随机生成的密钥，用于加密 JWT token
- 请妥善保管此密钥，不要泄露给他人
- 如果密钥泄露，请立即生成新的密钥并更新环境变量

## 📞 需要帮助？

如果部署遇到问题：
1. 检查 Railway 部署日志
2. 确认所有环境变量都已正确设置
3. 查看 `DEPLOYMENT_CHECKLIST.md` 获取详细故障排除指南

