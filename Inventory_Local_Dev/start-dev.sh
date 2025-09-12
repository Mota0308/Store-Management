#!/bin/bash
echo "正在啟動本地開發環境..."
echo

echo "[1/3] 安裝根目錄依賴..."
npm install

echo
echo "[2/3] 安裝客戶端依賴..."
cd client
npm install
cd ..

echo
echo "[3/3] 安裝服務器依賴..."
cd server
npm install
cd ..

echo
echo "所有依賴安裝完成！"
echo
echo "啟動開發服務器..."
npm run dev
