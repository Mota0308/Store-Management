import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import api from '../api'

type Location = { _id: string; name: string }

export default function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api.get('/locations').then(r => setLocations(r.data))
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

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
            transition: 'all 0.2s'
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
            transition: 'all 0.2s'
          }}
        >
          添加產品
        </Link>
      </div>

      {/* Content area */}
      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}
