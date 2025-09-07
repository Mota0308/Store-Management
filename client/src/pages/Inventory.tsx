import React, { useState, useEffect } from 'react'
import api from '../api'

// 定義類型接口
interface Location {
  _id: string
  name: string
}

interface ProductType {
  _id: string
  name: string
}

interface Inventory {
  locationId: string
  quantity: number
}

interface Product {
  _id: string
  name: string
  productCode: string
  productType: string
  sizes?: string[]
  size?: string
  price: number
  inventories: Inventory[]
}

interface ProductGroup {
  key: string
  name: string
  productCode: string
  products: Product[]
}

export default function Inventory() {
  const [locations, setLocations] = useState<Location[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  
  // 導入庫存狀態
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; files: File[] }>({ locationId: '', files: [] })
  
  // 門市對調狀態
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferState, setTransferState] = useState<{ fromLocationId: string; toLocationId: string; files: File[] }>({ fromLocationId: '', toLocationId: '', files: [] })
  
  // Excel導入狀態
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [excelImportState, setExcelImportState] = useState<{ files: File[] }>({ files: [] })

  useEffect(() => {
    api.get('/locations').then((r: any) => {
      // 按照指定順序排序：觀塘，灣仔，荔枝角，元朗，國内倉
      const order = ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉'];
      const sortedLocations = r.data.sort((a: Location, b: Location) => {
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        return aIndex - bIndex;
      });
      setLocations(sortedLocations);
    })
    loadProductTypes()
  }, [])

  useEffect(() => {
    load()
  }, [selectedType, searchTerm, sortBy, sortOrder])

  async function loadProductTypes() {
    const response = await api.get('/product-types')
    setProductTypes(response.data)
  }

  async function load() {
    const response = await api.get('/products')
    setProducts(response.data)
  }

  useEffect(() => {
    let filtered = products

    // Filter by product type
    if (selectedType) {
      filtered = filtered.filter(p => p.productType === selectedType)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getProductSize(p).toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Sort products
    if (sortBy) {
      filtered = filtered.sort((a, b) => {
        let aValue: any, bValue: any

        if (sortBy === 'name') {
          aValue = a.name
          bValue = b.name
        } else if (sortBy === 'productCode') {
          aValue = a.productCode
          bValue = b.productCode
        } else if (sortBy === 'size') {
          aValue = getProductSize(a)
          bValue = getProductSize(b)
        } else if (sortBy === 'total') {
          aValue = a.inventories.reduce((sum: number, inv: Inventory) => sum + inv.quantity, 0)
          bValue = b.inventories.reduce((sum: number, inv: Inventory) => sum + inv.quantity, 0)
        } else {
          // Sort by location quantity
          const location = locations.find(l => l._id === sortBy)
          if (location) {
            const aInv = a.inventories.find((inv: Inventory) => inv.locationId === location._id)
            const bInv = b.inventories.find((inv: Inventory) => inv.locationId === location._id)
            aValue = aInv ? aInv.quantity : 0
            bValue = bInv ? bInv.quantity : 0
          }
        }

        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
        return 0
      })
    }

    setFilteredProducts(filtered)
  }, [products, selectedType, searchTerm, sortBy, sortOrder, locations])

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc') // 默認從高到低排序
    }
  }

  function getSortIcon(column: string) {
    if (sortBy !== column) return '↕'
    return sortOrder === 'asc' ? '↓' : '↑'
  }

  function getProductSize(product: Product): string {
    if (Array.isArray(product.sizes) && product.sizes.length) return product.sizes.join(', ')
    if (product.size) return product.size
    return '-'
  }

  function getQuantity(product: Product, locationId: string): number {
    const inventory = product.inventories.find((inv: Inventory) => inv.locationId === locationId)
    return inventory ? inventory.quantity : 0
  }

  function getTotalQuantity(product: Product): number {
    return product.inventories.reduce((sum: number, inv: Inventory) => sum + inv.quantity, 0)
  }

  // 導入庫存功能
  async function doImport(mode: 'incoming' | 'outgoing') {
    if (!importState.locationId || importState.files.length === 0) {
      alert('請選擇門市和PDF檔案')
      return
    }
    
    try {
      const form = new FormData()
      form.append('locationId', importState.locationId)
      importState.files.forEach(f => form.append('files', f))
      
      const response = await api.post(`/import/${mode}`, form)
      alert(`${mode === 'incoming' ? '進貨' : '出貨'}完成\n處理:${response.data.processed}  匹配:${response.data.matched}  更新:${response.data.updated}\n未找到: ${response.data.notFound?.join(', ') || '無'}`)
      setImportOpen(false)
      await load()
    } catch (error: any) {
      alert(`${mode === 'incoming' ? '進貨' : '出貨'}失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 門市對調功能
  async function doTransfer() {
    if (!transferState.fromLocationId || !transferState.toLocationId || transferState.files.length === 0) {
      alert('請選擇來源門市、目標門市和PDF檔案')
      return
    }
    
    try {
      const form = new FormData()
      form.append('fromLocationId', transferState.fromLocationId)
      form.append('toLocationId', transferState.toLocationId)
      transferState.files.forEach(f => form.append('files', f))
      
      const response = await api.post('/import/transfer', form)
      alert(`門市對調完成\n處理:${response.data.processed}  匹配:${response.data.matched}  更新:${response.data.updated}\n未找到: ${response.data.notFound?.join(', ') || '無'}`)
      setTransferOpen(false)
      await load()
    } catch (error: any) {
      alert(`門市對調失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // Excel導入功能
  async function doExcelImport() {
    if (excelImportState.files.length === 0) {
      alert('請選擇Excel檔案')
      return
    }
    
    try {
      const form = new FormData()
      excelImportState.files.forEach(f => form.append('files', f))
      
      const response = await api.post('/import/excel', form)
      alert(`Excel導入完成\n處理:${response.data.processed}  匹配:${response.data.matched}  新增:${response.data.created}  更新:${response.data.updated}\n錯誤: ${response.data.errors?.join(', ') || '無'}`)
      setExcelImportOpen(false)
      await load()
    } catch (error: any) {
      alert(`Excel導入失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // Group products by name and productCode
  const groupedProducts = filteredProducts.reduce((groups, product) => {
    const key = `${product.name}-${product.productCode}`
    if (!groups[key]) {
      groups[key] = {
        key,
        name: product.name,
        productCode: product.productCode,
        products: []
      }
    }
    groups[key].products.push(product)
    return groups
  }, {} as Record<string, ProductGroup>)

  function toggleGroup(groupKey: string) {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedGroups(newExpanded)
  }

  return (
    <div className="page">
      <div className="header">
        <h1>庫存管理</h1>
      </div>

      <div className="toolbar">
        <div className="filters">
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)}>
            <option value="">所有產品類型</option>
            {productTypes.map(type => (
              <option key={type._id} value={type.name}>{type.name}</option>
            ))}
          </select>
          
          <input
            type="text"
            placeholder="搜尋產品..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="spacer" />
        <button className="btn" onClick={() => setExcelImportOpen(true)}>導入Excel</button>
        <button className="btn" onClick={() => setImportOpen(true)}>導入庫存</button>
        <button className="btn" onClick={() => setTransferOpen(true)}>門市對調</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>產品</th>
              <th>編號</th>
              <th>尺寸</th>
              {locations.map(location => (
                <th key={location._id} onClick={() => handleSort(location._id)} style={{ cursor: 'pointer' }}>
                  {location.name} {getSortIcon(location._id)}
                </th>
              ))}
              <th onClick={() => handleSort('total')} style={{ cursor: 'pointer' }}>
                總計 {getSortIcon('total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts).map((group: ProductGroup) => (
              <React.Fragment key={group.key}>
                <tr className="group-header" onClick={() => toggleGroup(group.key)}>
                  <td colSpan={locations.length + 3} style={{ cursor: 'pointer' }}>
                    {expandedGroups.has(group.key) ? '▼' : '▶'} {group.name} ({group.productCode})
                  </td>
                </tr>
                {expandedGroups.has(group.key) && group.products.map((product: Product) => (
                  <tr key={product._id}>
                    <td>{product.name}</td>
                    <td>{product.productCode}</td>
                    <td>{getProductSize(product)}</td>
                    {locations.map(location => (
                      <td key={location._id}>{getQuantity(product, location._id)}</td>
                    ))}
                    <td>{getTotalQuantity(product)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 導入庫存彈窗 */}
      {importOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">導入庫存</div>
            <div className="body">
              <div>
                <p>選擇門市：</p>
                <select value={importState.locationId} onChange={e => setImportState(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">請選擇門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>選擇PDF檔案：</p>
                <input multiple type="file" accept=".pdf" onChange={e => setImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setImportOpen(false)}>取消</button>
              <button className="btn" onClick={() => doImport('incoming')}>進貨</button>
              <button className="btn" onClick={() => doImport('outgoing')}>出貨</button>
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
              <div>
                <p>來源門市：</p>
                <select value={transferState.fromLocationId} onChange={e => setTransferState(s => ({ ...s, fromLocationId: e.target.value }))}>
                  <option value="">請選擇來源門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>目標門市：</p>
                <select value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">請選擇目標門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>選擇PDF檔案：</p>
                <input multiple type="file" accept=".pdf" onChange={e => setTransferState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>取消</button>
              <button className="btn" onClick={doTransfer}>進行</button>
            </div>
          </div>
        </div>
      )}

      {/* Excel導入彈窗 */}
      {excelImportOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">導入Excel</div>
            <div className="body">
              <div style={{ marginBottom: '16px' }}>
                <p><strong>Excel格式要求：</strong></p>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>必須包含列：商品詳情、型號、商品選項、觀塘、灣仔、荔枝角、元朗、國内倉</li>
                  <li>商品詳情：產品名稱（支持變體：商品名稱、產品名稱、產品、名稱、商品）</li>
                  <li>型號：產品編號（支持變體：產品編號、編號、貨號、SKU、產品代碼）</li>
                  <li>商品選項：尺寸（支持變體：尺寸、規格、選項、尺碼）</li>
                  <li>各門市列：對應的庫存數量（支持變體：觀塘店、灣仔店等）</li>
                </ul>
              </div>
              <div>
                <p>選擇Excel檔案：</p>
                <input multiple type="file" accept=".xlsx,.xls" onChange={e => setExcelImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setExcelImportOpen(false)}>取消</button>
              <button className="btn" onClick={doExcelImport}>進行導入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}