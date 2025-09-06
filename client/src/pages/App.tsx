import { useEffect, useState } from 'react'
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
        <a href="/add" className="btn">添加產品</a>
        <a href="/inventory" className="btn secondary">庫存</a>
      </nav>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2>門市地點</h2>
        {locations.map(l => (
          <div key={l._id} className="card" style={{ padding: 12 }}>
            {l.name}
          </div>
        ))}
      </div>
    </div>
  )
}
