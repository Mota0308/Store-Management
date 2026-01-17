import axios from 'axios'

// 根據環境設置API基礎URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    // 生產環境：使用相對路徑，因為前端和後端在同一個域名下
    return '/api'
  } else {
    // 開發環境：使用localhost，端口4001
    return 'http://localhost:4001/api'
  }
}

const api = axios.create({ 
  baseURL: getApiBaseUrl(),
  timeout: 300000 // 5分钟超时，足够处理大文件
})

// 從 localStorage 獲取 token
const getToken = () => {
  return localStorage.getItem('token')
}

// 保存 token 到 localStorage
export const setToken = (token: string) => {
  localStorage.setItem('token', token)
}

// 移除 token
export const removeToken = () => {
  localStorage.removeItem('token')
}

// 請求攔截器 - 添加認證 token
api.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

// 響應攔截器
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('API Response Error:', error)
    if (error.response?.status === 401) {
      // 認證失敗，清除 token
      removeToken()
      // 只有在非登入頁面且不是認證檢查請求時才重定向
      const isAuthCheck = error.config?.url?.includes('/auth/me')
      if (!isAuthCheck && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api