import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'

type Location = { _id: string; name: string }

export default function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // 只在用戶已認證時加載 locations
    if (isAuthenticated) {
      api.get('/locations')
        .then(r => setLocations(r.data))
        .catch(err => {
          console.error('Failed to load locations:', err)
          // 如果獲取 locations 失敗，不阻止頁面顯示
        })
    }
  }, [isAuthenticated])

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app">
      {/* Mobile toggle button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMenuOpen(prev => !prev)}
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Overlay for mobile */}
      <div className={`mobile-overlay ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} />

      {/* Sidebar */}
      <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '18px' }}>庫存管理系統</h2>

        {user && (
          <div style={{ 
            padding: '12px 16px', 
            marginBottom: '16px', 
            background: 'rgba(255, 255, 255, 0.1)', 
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            <div style={{ color: '#e5e7eb', marginBottom: '4px' }}>用戶: {user.username}</div>
            <div style={{ color: '#9ca3af', fontSize: '12px' }}>{user.email}</div>
          </div>
        )}

        <Link 
          to="/" 
          className="nav-link"
          style={{
            padding: '12px 16px',
            backgroundColor: location.pathname === '/' ? 'white' : 'transparent',
            color: location.pathname === '/' ? '#3b82f6' : 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 500,
            transition: 'all 0.2s',
            display: 'block',
            marginBottom: '8px'
          }}
        >
          庫存
        </Link>

        <Link 
          to="/add-product" 
          className="nav-link"
          style={{
            padding: '12px 16px',
            backgroundColor: location.pathname === '/add-product' ? 'white' : 'transparent',
            color: location.pathname === '/add-product' ? '#3b82f6' : 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 500,
            transition: 'all 0.2s',
            display: 'block',
            marginBottom: '8px'
          }}
        >
          添加產品
        </Link>

        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'transparent',
            color: '#e5e7eb',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginTop: '16px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          登出
        </button>
      </div>

      {/* Content area */}
      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}
