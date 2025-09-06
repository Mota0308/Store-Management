import { useEffect, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import api from '../api'

type Location = { _id: string; name: string }

export default function App() {
  const [locations, setLocations] = useState<Location[]>([])

  useEffect(() => {
    api.get('/locations').then(r => setLocations(r.data))
  }, [])

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16 }}>
      <h1>庫存管理系統</h1>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link to="/" className="btn">添加產品</Link>
        <Link to="/inventory" className="btn secondary">庫存</Link>
      </nav>
      <Outlet />
    </div>
  )
}
