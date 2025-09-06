import { useEffect, useState } from 'react'
import api from '../api'

type Location = { _id: string; name: string }
type ProductType = { _id: string; name: string; description?: string }
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

type SortState = 'default' | 'asc' | 'desc'

// 產品分組類型
type ProductGroup = {
  key: string // 產品名稱 + 產品編號的組合
  name: string
  productCode: string
  productType: string
  products: Product[]
  totalQuantities: Record<string, number> // 各地點的總數量
}

export default function Inventory() {
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [editing, setEditing] = useState<Record<string, number>>({})
  const [filters, setFilters] = useState({ q: '', code: '', productType: '', size: '', sortBy: '', sortOrder: 'desc' })
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null })

  // 下拉選項狀態
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([])
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([])
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [showCodeDropdown, setShowCodeDropdown] = useState(false)

  // 每個地點的排序狀態
  const [locationSortStates, setLocationSortStates] = useState<Record<string, SortState>>({})

  // 分組展開狀態
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // 導入庫存狀態
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; mode: 'out' | 'in'; files: File[] }>({ locationId: '', mode: 'out', files: [] })

  // 門市對調狀態
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferState, setTransferState] = useState<{
    fromLocationId: string
    toLocationId: string
    products: { productId: string; quantity: number }[]
  }>({ fromLocationId: '', toLocationId: '', products: [] })

  useEffect(() => {
    api.get('/locations').then(r => setLocations(r.data))
    loadProductTypes()
  }, [])

  const loadProductTypes = async () => {
    try {
      const response = await api.get('/product-types')
      setProductTypes(response.data)
    } catch (error) {
      console.error('Failed to load product types:', error)
    }
  }

  async function load() {
    const params: any = {}
    if (filters.q) params.q = filters.q
    if (filters.code) params.productCode = filters.code
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

  // 生成名稱建議
  const generateNameSuggestions = (input: string) => {
    if (!input.trim()) {
      setNameSuggestions([])
      return
    }
    const suggestions = products
      .map(p => p.name)
      .filter(name => name.toLowerCase().includes(input.toLowerCase()))
      .filter((name, index, arr) => arr.indexOf(name) === index) // 去重
      .slice(0, 5) // 最多顯示5個建議
    setNameSuggestions(suggestions)
  }

  // 生成編號建議
  const generateCodeSuggestions = (input: string) => {
    if (!input.trim()) {
      setCodeSuggestions([])
      return
    }
    const suggestions = products
      .map(p => p.productCode)
      .filter(code => code.toLowerCase().includes(input.toLowerCase()))
      .filter((code, index, arr) => arr.indexOf(code) === index) // 去重
      .slice(0, 5) // 最多顯示5個建議
    setCodeSuggestions(suggestions)
  }

  function getQty(p: Product, locId: string) {
    return p.inventories.find(i => i.locationId === locId)?.quantity ?? 0
  }

  function renderSizes(p: Product) {
    if (Array.isArray(p.sizes) && p.sizes.length) return p.sizes.join(', ')
    if (p.size) return p.size
    return '-'
  }

  // 產品分組邏輯
  const groupProducts = (products: Product[]): ProductGroup[] => {
    const groupMap = new Map<string, ProductGroup>()

    products.forEach(product => {
      const key = `${product.name}|${product.productCode}`
      
      if (!groupMap.has(key)) {
        // 計算各地點的總數量
        const totalQuantities: Record<string, number> = {}
        locations.forEach(location => {
          totalQuantities[location._id] = 0
        })

        groupMap.set(key, {
          key,
          name: product.name,
          productCode: product.productCode,
          productType: product.productType,
          products: [],
          totalQuantities
        })
      }

      const group = groupMap.get(key)!
      group.products.push(product)
      
      // 累加各地點的數量
      locations.forEach(location => {
        const qty = getQty(product, location._id)
        group.totalQuantities[location._id] += qty
      })
    })

    return Array.from(groupMap.values())
  }

  // 切換分組展開狀態
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  // 處理地點排序
  const handleLocationSort = (locationId: string) => {
    const currentState = locationSortStates[locationId] || 'default'
    let nextState: SortState

    switch (currentState) {
      case 'default':
        nextState = 'desc' // 高到低
        break
      case 'desc':
        nextState = 'asc'  // 低到高
        break
      case 'asc':
        nextState = 'default' // 恢復默認
        break
    }

    setLocationSortStates(prev => ({ ...prev, [locationId]: nextState }))

    // 根據排序狀態對產品進行排序
    if (nextState === 'default') {
      // 恢復默認排序，重新加載數據
      load()
    } else {
      // 對當前產品列表進行排序
      setProducts(prev => {
        const sorted = [...prev].sort((a, b) => {
          const aQty = getQty(a, locationId)
          const bQty = getQty(b, locationId)
          return nextState === 'desc' ? bQty - aQty : aQty - bQty
        })
        return sorted
      })
    }
  }

  // 獲取排序箭頭圖標
  const getSortIcon = (locationId: string) => {
    const state = locationSortStates[locationId] || 'default'
    switch (state) {
      case 'desc':
        return '↑' // 向上箭頭 - 高到低排列
      case 'asc':
        return '↓' // 向下箭頭 - 低到高排列
      default:
        return '?' // 雙向箭頭 - 默認狀態
    }
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

  async function deleteProduct(product: Product) {
    try {
      console.log('正在刪除商品:', product._id, product.name)
      const response = await api.delete(`/products/${product._id}`)
      console.log('刪除響應:', response.data)
      
      setDeleteModal({ isOpen: false, product: null })
      await load()
      alert('商品已成功刪除')
    } catch (error: any) {
      console.error('刪除商品失敗:', error)
      console.error('錯誤詳情:', error.response?.data)
      alert(`刪除商品失敗: ${error.response?.data?.message || error.message}`)
    }
  }

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

  // 門市對調功能
  async function doTransfer() {
    if (!transferState.fromLocationId || !transferState.toLocationId || transferState.products.length === 0) {
      alert('請選擇來源門市、目標門市和產品')
      return
    }
    
    try {
      const response = await api.post('/inventory/transfer', transferState)
      alert(`門市對調完成：${response.data.message}`)
      setTransferOpen(false)
      await load()
    } catch (error: any) {
      alert(`門市對調失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 獲取分組後的產品列表
  const productGroups = groupProducts(products)

  return (
    <div className="card" style={{ display: 'grid', gap: 14 }}>
      <div className="toolbar">
        <div className="field">
          <div>產品名稱關鍵字</div>
          <div style={{ position: 'relative' }}>
            <input 
              className="input" 
              value={filters.q} 
              onChange={e => {
                setFilters({ ...filters, q: e.target.value })
                generateNameSuggestions(e.target.value)
                setShowNameDropdown(true)
              }}
              onFocus={() => setShowNameDropdown(true)}
              onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
              placeholder="輸入產品名稱關鍵字"
            />
            {showNameDropdown && nameSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {nameSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: index < nameSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setFilters({ ...filters, q: suggestion })
                      setShowNameDropdown(false)
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white'
                    }}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="field">
          <div>產品編號</div>
          <div style={{ position: 'relative' }}>
            <input 
              className="input" 
              value={filters.code} 
              onChange={e => {
                setFilters({ ...filters, code: e.target.value })
                generateCodeSuggestions(e.target.value)
                setShowCodeDropdown(true)
              }}
              onFocus={() => setShowCodeDropdown(true)}
              onBlur={() => setTimeout(() => setShowCodeDropdown(false), 200)}
              placeholder="輸入產品編號關鍵字"
            />
            {showCodeDropdown && codeSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {codeSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: index < codeSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setFilters({ ...filters, code: suggestion })
                      setShowCodeDropdown(false)
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white'
                    }}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="field">
          <div>產品類型</div>
          <select className="select" value={filters.productType} onChange={e => setFilters({ ...filters, productType: e.target.value })}>
            <option value="">全部</option>
            {productTypes.map(type => (
              <option key={type._id} value={type.name}>{type.name}</option>
            ))}
          </select>
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
        <button className="btn" onClick={() => setTransferOpen(true)}>門市對調</button>
      </div>

      <div>
        <table className="table">
          <thead>
            <tr>
              <th>產品名稱</th>
              <th>產品編號</th>
              <th>產品類型</th>
              <th>尺寸</th>
              {locations.map(l => (
                <th key={l._id} className="right col-num">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>{l.name}</span>
                    <button
                      onClick={() => handleLocationSort(l._id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#dc2626',
                        padding: '2px',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '20px',
                        height: '20px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                      title={`點擊排序：${locationSortStates[l._id] === 'default' ? '高到低' : locationSortStates[l._id] === 'desc' ? '低到高' : '恢復默認'}`}
                    >
                      {getSortIcon(l._id)}
                    </button>
                  </div>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productGroups.map(group => (
              <>
                {/* 分組標題行 */}
                <tr 
                  key={group.key} 
                  style={{ 
                    backgroundColor: '#f8fafc', 
                    cursor: 'pointer',
                    borderBottom: '2px solid #e2e8f0'
                  }}
                  onClick={() => toggleGroup(group.key)}
                >
                  <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '16px' }}>
                      {expandedGroups.has(group.key) ? '▼' : '?'}
                    </span>
                    {group.name}
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>
                      ({group.products.length} 個尺寸)
                    </span>
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{group.productCode}</td>
                  <td style={{ fontWeight: 'bold' }}>{group.productType}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {group.products.map(p => renderSizes(p)).join(', ')}
                  </td>
                  {locations.map(l => (
                    <td key={l._id} className="right col-num" style={{ fontWeight: 'bold' }}>
                      {group.totalQuantities[l._id] || 0}
                    </td>
                  ))}
                  <td></td>
                </tr>
                
                {/* 展開的產品詳情行 */}
                {expandedGroups.has(group.key) && group.products.map(p => (
                  <tr key={p._id} style={{ backgroundColor: '#fefefe' }}>
                    <td style={{ paddingLeft: '32px', color: '#6b7280' }}>
                      {p.name}
                    </td>
                    <td style={{ color: '#6b7280' }}>
                      {p.productCode}
                    </td>
                    <td style={{ color: '#6b7280' }}>
                      {p.productType}
                    </td>
                    <td style={{ color: '#6b7280' }}>
                      {renderSizes(p)}
                    </td>
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
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {Object.keys(editing).some(k => k.startsWith(p._id + ':')) ? (
                          <button className="btn" onClick={() => save(p)}>保存</button>
                        ) : (
                          <button className="btn secondary" onClick={() => setEditing(prev => {
                            const next: Record<string, number> = { ...prev }
                            locations.forEach(l => { next[`${p._id}:${l._id}`] = getQty(p, l._id) })
                            return next
                          })}>修改庫存</button>
                        )}
                        <button 
                          className="btn" 
                          style={{ backgroundColor: '#dc2626', color: 'white' }}
                          onClick={() => setDeleteModal({ isOpen: true, product: p })}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* 刪除確認彈窗 */}
      {deleteModal.isOpen && deleteModal.product && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">確認刪除</div>
            <div className="body">
              <p>您確定要刪除以下商品嗎？</p>
              <div style={{ padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', margin: '12px 0' }}>
                <p><strong>商品名稱：</strong>{deleteModal.product.name}</p>
                <p><strong>商品編號：</strong>{deleteModal.product.productCode}</p>
                <p><strong>商品類型：</strong>{deleteModal.product.productType}</p>
                <p><strong>商品ID：</strong>{deleteModal.product._id}</p>
              </div>
              <p style={{ color: '#dc2626', fontWeight: 'bold' }}> 此操作無法撤銷，將永久刪除商品及其所有相關數據！</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setDeleteModal({ isOpen: false, product: null })}>取消</button>
              <button 
                className="btn" 
                style={{ backgroundColor: '#dc2626', color: 'white' }}
                onClick={() => deleteProduct(deleteModal.product!)}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 導入庫存彈窗 */}
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

      {/* 門市對調彈窗 */}
      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">門市對調</div>
            <div className="body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>來源門市</div>
                <select className="select" value={transferState.fromLocationId} onChange={e => setTransferState(s => ({ ...s, fromLocationId: e.target.value }))}>
                  <option value="">選擇來源門市</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
                <div>目標門市</div>
                <select className="select" value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">選擇目標門市</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <p>選擇要轉移的產品：</p>
                <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '8px' }}>
                  {products.map(product => (
                    <div key={product._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTransferState(prev => ({
                              ...prev,
                              products: [...prev.products, { productId: product._id, quantity: 0 }]
                            }))
                          } else {
                            setTransferState(prev => ({
                              ...prev,
                              products: prev.products.filter(p => p.productId !== product._id)
                            }))
                          }
                        }}
                      />
                      <span>{product.name} ({product.productCode})</span>
                      {transferState.products.find(p => p.productId === product._id) && (
                        <input
                          type="number"
                          placeholder="數量"
                          min="0"
                          onChange={(e) => {
                            const quantity = parseInt(e.target.value) || 0
                            setTransferState(prev => ({
                              ...prev,
                              products: prev.products.map(p => 
                                p.productId === product._id ? { ...p, quantity } : p
                              )
                            }))
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>取消</button>
              <button className="btn" onClick={doTransfer}>進行對調</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
