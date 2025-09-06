import { useEffect, useState } from 'react'
import api from '../api'

type Location = { _id: string; name: string }
type Product = {
  _id: string
  name: string
  productCode: string
  productType: string
  sizes?: string[]
  size?: string
  price: number
  inventories: { locationId: string; quantity: number }[]
}

export default function Inventory() {
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [editing, setEditing] = useState<Record<string, number>>({})
  const [filters, setFilters] = useState({ q: '', code: '', locationId: '', productType: '', size: '', sortBy: '', sortOrder: 'desc' })

  useEffect(() => {
    api.get('/locations').then(r => setLocations(r.data))
  }, [])

  async function load() {
    const params: any = {}
    if (filters.q) params.q = filters.q
    if (filters.code) params.productCode = filters.code
    if (filters.locationId) params.locationId = filters.locationId
    if (filters.productType) params.productType = filters.productType
    if (filters.size) params.size = filters.size
    if (filters.sortBy) {
      params.sortBy = filters.sortBy
      params.sortOrder = filters.sortOrder
    }
    const { data } = await api.get('/products', { params })
    setProducts(data)
  }

  useEffect(() => { load() }, [filters])

  function getQty(p: Product, locId: string) {
    return p.inventories.find(i => i.locationId === locId)?.quantity ?? 0
  }

  function renderSizes(p: Product) {
    if (Array.isArray(p.sizes) && p.sizes.length) return p.sizes.join(', ')
    if (p.size) return p.size
    return '-'
  }

  async function save(p: Product) {
    const changes = locations
      .map(l => ({ locationId: l._id, quantity: editing[`${p._id}:${l._id}`] ?? getQty(p, l._id) }))
    await api.patch(`/products/${p._id}/inventory`, { quantities: changes })
    setEditing(prev => {
      const copy = { ...prev }
      Object.keys(copy).forEach(k => { if (k.startsWith(p._id + ':')) delete copy[k] })
      return copy
    })
    await load()
  }

  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; mode: 'out' | 'in'; files: File[] }>({ locationId: '', mode: 'out', files: [] })

  async function doImport() {
    if (!importState.locationId || importState.files.length === 0) { alert('請選擇地點與檔案'); return }
    const form = new FormData()
    form.append('locationId', importState.locationId)
    importState.files.forEach(f => form.append('files', f))
    const url = importState.mode === 'out' ? '/import/outgoing' : '/import/incoming'
    const { data } = await api.post(url, form)
    alert(`匯入完成\n檔案:${data.files}  匹配:${data.matched}  更新:${data.updated}\n未找到: ${data.notFound?.join(', ') || '無'}`)
    setImportOpen(false)
    await load()
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 14 }}>
      <div className="toolbar">
        <div className="field">
          <div>產品名稱關鍵字</div>
          <input className="input" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div className="field">
          <div>產品編號</div>
          <input className="input" value={filters.code} onChange={e => setFilters({ ...filters, code: e.target.value })} />
        </div>
        <div className="field">
          <div>門市地點</div>
          <select className="select" value={filters.locationId} onChange={e => setFilters({ ...filters, locationId: e.target.value })}>
            <option value="">全部</option>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <div>產品類型</div>
          <input className="input" value={filters.productType} onChange={e => setFilters({ ...filters, productType: e.target.value })} />
        </div>
        <div className="field">
          <div>尺寸</div>
          <input className="input" value={filters.size} onChange={e => setFilters({ ...filters, size: e.target.value })} />
        </div>
        <div className="field">
          <div>排序</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" value={filters.sortBy} onChange={e => setFilters({ ...filters, sortBy: e.target.value })}>
              <option value="">無</option>
              <option value="price">價格</option>
              <option value="quantity">庫存數量</option>
            </select>
            <select className="select" value={filters.sortOrder} onChange={e => setFilters({ ...filters, sortOrder: e.target.value })}>
              <option value="desc">從高到低</option>
              <option value="asc">從低到高</option>
            </select>
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setImportOpen(true)}>導入庫存</button>
      </div>

      <div>
        <table className="table">
          <thead>
            <tr>
              <th>產品姓名</th>
              <th>產品編號</th>
              <th>產品類型</th>
              <th>尺寸</th>
              {locations.map(l => (
                <th key={l._id} className="right col-num">{l.name}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.productCode}</td>
                <td>{p.productType}</td>
                <td>{renderSizes(p)}</td>
                {locations.map(l => (
                  <td key={l._id} className="right col-num">
                    {editing[`${p._id}:${l._id}`] !== undefined ? (
                      <input
                        type="number"
                        className="input"
                        style={{ width: '100%', height: 34 }}
                        value={editing[`${p._id}:${l._id}`]}
                        onChange={e => setEditing(prev => ({ ...prev, [`${p._id}:${l._id}`]: parseInt(e.target.value || '0', 10) }))}
                      />
                    ) : (
                      getQty(p, l._id)
                    )}
                  </td>
                ))}
                <td className="right">
                  {Object.keys(editing).some(k => k.startsWith(p._id + ':')) ? (
                    <button className="btn" onClick={() => save(p)}>保存</button>
                  ) : (
                    <button className="btn secondary" onClick={() => setEditing(prev => {
                      const next: Record<string, number> = { ...prev }
                      locations.forEach(l => { next[`${p._id}:${l._id}`] = getQty(p, l._id) })
                      return next
                    })}>修改庫存</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">導入庫存</div>
            <div className="body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>門市地點</div>
                <select className="select" value={importState.locationId} onChange={e => setImportState(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">選擇地點</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
                <button className={`btn ${importState.mode === 'out' ? '' : 'secondary'}`} onClick={() => setImportState(s => ({ ...s, mode: 'out' }))}>出貨</button>
                <button className={`btn ${importState.mode === 'in' ? '' : 'secondary'}`} onClick={() => setImportState(s => ({ ...s, mode: 'in' }))}>進貨</button>
              </div>
              <input multiple type="file" accept="application/pdf" onChange={e => setImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setImportOpen(false)}>取消</button>
              <button className="btn" onClick={doImport}>進行</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
