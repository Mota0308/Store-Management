# 本地開發環境啟動腳本

## 快速開始

### 1. 安裝所有依賴
`ash
npm run install:all
`

### 2. 啟動開發服務器
`ash
npm run dev
`

這將同時啟動：
- 後端服務器 (http://localhost:4001)
- 前端開發服務器 (http://localhost:3000)

## 可用命令

- 
pm run dev - 同時啟動前端和後端開發服務器
- 
pm run dev:server - 只啟動後端服務器
- 
pm run dev:client - 只啟動前端開發服務器
- 
pm run build - 構建生產版本
- 
pm run start - 啟動生產服務器
- 
pm run clean - 清理構建文件
- 
pm run reset - 重置環境（清理並重新安裝）

## 環境配置

- 本地開發使用獨立的數據庫：Storage_Local_Dev
- 前端開發服務器：http://localhost:3000
- 後端API服務器：http://localhost:4001
- 所有功能與生產環境相同

## 注意事項

- 本地環境使用獨立的MongoDB數據庫，不會影響生產數據
- 可以安全地進行測試和修改
- 所有功能包括：庫存管理、Excel導入導出、響應式設計等
