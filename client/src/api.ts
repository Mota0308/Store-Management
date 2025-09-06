import axios from 'axios'

// 根據環境設置API基礎URL
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    // 生產環境：使用相對路徑，因為前端和後端在同一個域名下
    return '/api'
  } else {
    // 開發環境：使用localhost
    return 'http://localhost:4001/api'
  }
}

const api = axios.create({ 
  baseURL: getApiBaseUrl(),
  timeout: 10000 // 10秒超時
})

// 請求攔截器
api.interceptors.request.use(
  (config) => {
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
      // 可以在這裡處理認證錯誤
      console.log('Unauthorized access')
    }
    return Promise.reject(error)
  }
)

export default api
