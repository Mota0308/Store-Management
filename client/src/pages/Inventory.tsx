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

// ���~��������
type ProductGroup = {
  key: string // ���~�W�� + ���~�s�����զX
  name: string
  productCode: string
  productType: string
  products: Product[]
  totalQuantities: Record<string, number> // �U�a�I���`�ƶq
}

export default function Inventory() {
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [editing, setEditing] = useState<Record<string, number>>({})
  const [filters, setFilters] = useState({ q: '', code: '', productType: '', size: '', sortBy: '', sortOrder: 'desc' })
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null })

  // �U�Կﶵ���A
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([])
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([])
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [showCodeDropdown, setShowCodeDropdown] = useState(false)

  // �C�Ӧa�I���ƧǪ��A
  const [locationSortStates, setLocationSortStates] = useState<Record<string, SortState>>({})

  // ���ծi�}���A
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // �ɤJ�w�s���A
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; mode: 'out' | 'in'; files: File[] }>({ locationId: '', mode: 'out', files: [] })

  // ������ժ��A
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

  // �ͦ��W�٫�ĳ
  const generateNameSuggestions = (input: string) => {
    if (!input.trim()) {
      setNameSuggestions([])
      return
    }
    const suggestions = products
      .map(p => p.name)
      .filter(name => name.toLowerCase().includes(input.toLowerCase()))
      .filter((name, index, arr) => arr.indexOf(name) === index) // �h��
      .slice(0, 5) // �̦h���5�ӫ�ĳ
    setNameSuggestions(suggestions)
  }

  // �ͦ��s����ĳ
  const generateCodeSuggestions = (input: string) => {
    if (!input.trim()) {
      setCodeSuggestions([])
      return
    }
    const suggestions = products
      .map(p => p.productCode)
      .filter(code => code.toLowerCase().includes(input.toLowerCase()))
      .filter((code, index, arr) => arr.indexOf(code) === index) // �h��
      .slice(0, 5) // �̦h���5�ӫ�ĳ
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

  // ���~�����޿�
  const groupProducts = (products: Product[]): ProductGroup[] => {
    const groupMap = new Map<string, ProductGroup>()

    products.forEach(product => {
      const key = `${product.name}|${product.productCode}`
      
      if (!groupMap.has(key)) {
        // �p��U�a�I���`�ƶq
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
      
      // �֥[�U�a�I���ƶq
      locations.forEach(location => {
        const qty = getQty(product, location._id)
        group.totalQuantities[location._id] += qty
      })
    })

    return Array.from(groupMap.values())
  }

  // �������ծi�}���A
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

  // �B�z�a�I�Ƨ�
  const handleLocationSort = (locationId: string) => {
    const currentState = locationSortStates[locationId] || 'default'
    let nextState: SortState

    switch (currentState) {
      case 'default':
        nextState = 'desc' // ����C
        break
      case 'desc':
        nextState = 'asc'  // �C�찪
        break
      case 'asc':
        nextState = 'default' // ��_�q�{
        break
    }

    setLocationSortStates(prev => ({ ...prev, [locationId]: nextState }))

    // �ھڱƧǪ��A�ﲣ�~�i��Ƨ�
    if (nextState === 'default') {
      // ��_�q�{�ƧǡA���s�[���ƾ�
      load()
    } else {
      // ���e���~�C��i��Ƨ�
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

  // ����Ƨǽb�Y�ϼ�
  const getSortIcon = (locationId: string) => {
    const state = locationSortStates[locationId] || 'default'
    switch (state) {
      case 'desc':
        return '��' // �V�W�b�Y - ����C�ƦC
      case 'asc':
        return '��' // �V�U�b�Y - �C�찪�ƦC
      default:
        return '?' // ���V�b�Y - �q�{���A
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
      console.log('���b�R���ӫ~:', product._id, product.name)
      const response = await api.delete(`/products/${product._id}`)
      console.log('�R���T��:', response.data)
      
      setDeleteModal({ isOpen: false, product: null })
      await load()
      alert('�ӫ~�w���\�R��')
    } catch (error: any) {
      console.error('�R���ӫ~����:', error)
      console.error('���~�Ա�:', error.response?.data)
      alert(`�R���ӫ~����: ${error.response?.data?.message || error.message}`)
    }
  }

  async function doImport() {
    if (!importState.locationId || importState.files.length === 0) { alert('�п�ܦa�I�P�ɮ�'); return }
    const form = new FormData()
    form.append('locationId', importState.locationId)
    importState.files.forEach(f => form.append('files', f))
    const url = importState.mode === 'out' ? '/import/outgoing' : '/import/incoming'
    const { data } = await api.post(url, form)
    alert(`�פJ����\n�ɮ�:${data.files}  �ǰt:${data.matched}  ��s:${data.updated}\n�����: ${data.notFound?.join(', ') || '�L'}`)
    setImportOpen(false)
    await load()
  }

  // ������ե\��
  async function doTransfer() {
    if (!transferState.fromLocationId || !transferState.toLocationId || transferState.products.length === 0) {
      alert('�п�ܨӷ������B�ؼЪ����M���~')
      return
    }
    
    try {
      const response = await api.post('/inventory/transfer', transferState)
      alert(`������է����G${response.data.message}`)
      setTransferOpen(false)
      await load()
    } catch (error: any) {
      alert(`������ե��ѡG${error.response?.data?.message || error.message}`)
    }
  }

  // ������ի᪺���~�C��
  const productGroups = groupProducts(products)

  return (
    <div className="card" style={{ display: 'grid', gap: 14 }}>
      <div className="toolbar">
        <div className="field">
          <div>���~�W������r</div>
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
              placeholder="��J���~�W������r"
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
          <div>���~�s��</div>
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
              placeholder="��J���~�s������r"
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
          <div>���~����</div>
          <select className="select" value={filters.productType} onChange={e => setFilters({ ...filters, productType: e.target.value })}>
            <option value="">����</option>
            {productTypes.map(type => (
              <option key={type._id} value={type.name}>{type.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <div>�ؤo</div>
          <input className="input" value={filters.size} onChange={e => setFilters({ ...filters, size: e.target.value })} />
        </div>
        <div className="field">
          <div>�Ƨ�</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" value={filters.sortBy} onChange={e => setFilters({ ...filters, sortBy: e.target.value })}>
              <option value="">�L</option>
              <option value="price">����</option>
              <option value="quantity">�w�s�ƶq</option>
            </select>
            <select className="select" value={filters.sortOrder} onChange={e => setFilters({ ...filters, sortOrder: e.target.value })}>
              <option value="desc">�q����C</option>
              <option value="asc">�q�C�찪</option>
            </select>
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setImportOpen(true)}>�ɤJ�w�s</button>
        <button className="btn" onClick={() => setTransferOpen(true)}>�������</button>
      </div>

      <div>
        <table className="table">
          <thead>
            <tr>
              <th>���~�W��</th>
              <th>���~�s��</th>
              <th>���~����</th>
              <th>�ؤo</th>
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
                      title={`�I���ƧǡG${locationSortStates[l._id] === 'default' ? '����C' : locationSortStates[l._id] === 'desc' ? '�C�찪' : '��_�q�{'}`}
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
                {/* ���ռ��D�� */}
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
                      {expandedGroups.has(group.key) ? '��' : '?'}
                    </span>
                    {group.name}
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>
                      ({group.products.length} �Ӥؤo)
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
                
                {/* �i�}�����~�Ա��� */}
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
                          <button className="btn" onClick={() => save(p)}>�O�s</button>
                        ) : (
                          <button className="btn secondary" onClick={() => setEditing(prev => {
                            const next: Record<string, number> = { ...prev }
                            locations.forEach(l => { next[`${p._id}:${l._id}`] = getQty(p, l._id) })
                            return next
                          })}>�ק�w�s</button>
                        )}
                        <button 
                          className="btn" 
                          style={{ backgroundColor: '#dc2626', color: 'white' }}
                          onClick={() => setDeleteModal({ isOpen: true, product: p })}
                        >
                          �R��
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

      {/* �R���T�{�u�� */}
      {deleteModal.isOpen && deleteModal.product && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�T�{�R��</div>
            <div className="body">
              <p>�z�T�w�n�R���H�U�ӫ~�ܡH</p>
              <div style={{ padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', margin: '12px 0' }}>
                <p><strong>�ӫ~�W�١G</strong>{deleteModal.product.name}</p>
                <p><strong>�ӫ~�s���G</strong>{deleteModal.product.productCode}</p>
                <p><strong>�ӫ~�����G</strong>{deleteModal.product.productType}</p>
                <p><strong>�ӫ~ID�G</strong>{deleteModal.product._id}</p>
              </div>
              <p style={{ color: '#dc2626', fontWeight: 'bold' }}> ���ާ@�L�k�M�P�A�N�ä[�R���ӫ~�Ψ�Ҧ������ƾڡI</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setDeleteModal({ isOpen: false, product: null })}>����</button>
              <button 
                className="btn" 
                style={{ backgroundColor: '#dc2626', color: 'white' }}
                onClick={() => deleteProduct(deleteModal.product!)}
              >
                �T�{�R��
              </button>
            </div>
          </div>
        </div>
      )}

      {/* �ɤJ�w�s�u�� */}
      {importOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�ɤJ�w�s</div>
            <div className="body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>�����a�I</div>
                <select className="select" value={importState.locationId} onChange={e => setImportState(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">��ܦa�I</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
                <button className={`btn ${importState.mode === 'out' ? '' : 'secondary'}`} onClick={() => setImportState(s => ({ ...s, mode: 'out' }))}>�X�f</button>
                <button className={`btn ${importState.mode === 'in' ? '' : 'secondary'}`} onClick={() => setImportState(s => ({ ...s, mode: 'in' }))}>�i�f</button>
              </div>
              <input multiple type="file" accept="application/pdf" onChange={e => setImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setImportOpen(false)}>����</button>
              <button className="btn" onClick={doImport}>�i��</button>
            </div>
          </div>
        </div>
      )}

      {/* ������ռu�� */}
      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�������</div>
            <div className="body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>�ӷ�����</div>
                <select className="select" value={transferState.fromLocationId} onChange={e => setTransferState(s => ({ ...s, fromLocationId: e.target.value }))}>
                  <option value="">��ܨӷ�����</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
                <div>�ؼЪ���</div>
                <select className="select" value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">��ܥؼЪ���</option>
                  {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <p>��ܭn�ಾ�����~�G</p>
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
                          placeholder="�ƶq"
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
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>����</button>
              <button className="btn" onClick={doTransfer}>�i����</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
