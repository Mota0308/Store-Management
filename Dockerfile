FROM node:18-alpine

# 設置工作目錄
WORKDIR /app

# 複製package.json文件
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安裝依賴
RUN npm install
RUN cd server && npm install
RUN cd client && npm install

# 複製源代碼
COPY . .

# 構建前端
RUN cd client && npm run build

# 構建後端
RUN cd server && npm run build

# 暴露端口
EXPOSE 4001

# 設置環境變量
ENV NODE_ENV=production
ENV PORT=4001

# 啟動命令
CMD ["npm", "run", "start"]
