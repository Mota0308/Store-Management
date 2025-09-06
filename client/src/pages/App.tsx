import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import api from '../api'

type Location = { _id: string; name: string }

export default function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const location = useLocation()

  useEffect(() => {
    api.get('/locations').then(r => setLocations(r.data))
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* 左側導航欄 */}
      <div style={{
        width: '200px',
        backgroundColor: '#3b82f6',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '18px' }}>庫存管理系統</h2>
        
        <Link 
          to="/" 
          style={{
            padding: '12px 16px',
            backgroundColor: location.pathname === '/' ? 'white' : 'transparent',
            color: location.pathname === '/' ? '#3b82f6' : 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
        >
          庫存
        </Link>
        
        <Link 
          to="/add-product" 
          style={{
            padding: '12px 16px',
            backgroundColor: location.pathname === '/add-product' ? 'white' : 'transparent',
            color: location.pathname === '/add-product' ? '#3b82f6' : 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
        >
          添加產品
        </Link>
      </div>

      {/* 主內容區域 */}
      <div style={{ flex: 1, padding: '20px' }}>
        <Outlet />
      </div>
    </div>
  )
}
