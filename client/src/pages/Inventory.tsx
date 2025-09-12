import React, { useState, useEffect } from 'react'
import api from '../api'
import * as XLSX from 'xlsx'

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
  locationId: string | { _id: string; name: string } // 支持 populate 後的對象
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

  // 編輯狀態
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    productCode: string
    productType: string
    size: string
    price: number
    inventories: Array<{ locationId: string; quantity: number }>
  }>({
    name: '',
    productCode: '',
    productType: '',
    size: '',
    price: 0,
    inventories: []
  })

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
    setProductTypes(response.data || [])
  }

  async function load() {
    const response = await api.get('/products')
    // 修復：後端返回的是 { products: [...], pagination: {...} }
    setProducts(response.data.products || [])
  }

  useEffect(() => {
    let filtered = products || [] // 添加安全檢查

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
      filtered.sort((a, b) => {
        let aValue: any, bValue: any
        
        if (sortBy === 'total') {
          aValue = getTotalQuantity(a)
          bValue = getTotalQuantity(b)
        } else if (sortBy === 'name') {
          aValue = a.name
          bValue = b.name
        } else if (sortBy === 'productCode') {
          aValue = a.productCode
          bValue = b.productCode
        } else if (sortBy === 'size') {
          aValue = getProductSize(a)
          bValue = getProductSize(b)
        } else {
          // Location sorting
          aValue = getQuantity(a, sortBy)
          bValue = getQuantity(b, sortBy)
        }
        
        if (typeof aValue === 'string') {
          return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
        } else {
          return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
        }
      })
    }

    setFilteredProducts(filtered)
  }, [products, selectedType, searchTerm, sortBy, sortOrder])

  function getProductSize(product: Product): string {
    if (product.sizes && product.sizes.length > 0) {
      return product.sizes.join(', ')
    }
    return product.size || ''
  }

  function getQuantity(product: Product, locationId: string): number {
    if (!product.inventories || !Array.isArray(product.inventories)) {
      return 0
    }
    const inventory = product.inventories.find(inv => {
      // 處理 populate 後的 locationId 對象
      if (typeof inv.locationId === 'object' && inv.locationId !== null) {
        return inv.locationId._id === locationId || inv.locationId._id.toString() === locationId
      }
      // 處理原始的 ObjectId 字符串
      return inv.locationId === locationId || inv.locationId.toString() === locationId
    })
    return inventory ? inventory.quantity : 0
  }

  function getTotalQuantity(product: Product): number {
    if (!product.inventories || !Array.isArray(product.inventories)) {
      return 0
    }
    return product.inventories.reduce((sum, inv) => sum + inv.quantity, 0)
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  function getSortIcon(column: string): string {
    if (sortBy !== column) return '↕'
    return sortOrder === 'asc' ? '↓' : '↑'
  }

  // 導入庫存功能
  async function doImport(type: 'incoming' | 'outgoing') {
    if (importState.locationId === '') {
      alert('請選擇門市')
      return
    }
    if (importState.files.length === 0) {
      alert('請選擇PDF檔案')
      return
    }
    
    try {
      const form = new FormData()
      form.append('locationId', importState.locationId)
      importState.files.forEach(f => form.append('files', f))
      
      // 修復：根據type調用不同的API端點
      const response = await api.post(`/import/${type}`, form)
      alert(`${type === 'incoming' ? '進貨' : '出貨'}完成\n處理:${response.data.processed}  匹配:${response.data.matched}  新增:${response.data.created}  更新:${response.data.updated}\n未找到: ${response.data.notFound?.join(', ') || '無'}`)
      setImportOpen(false)
      await load()
    } catch (error: any) {
      alert(`${type === 'incoming' ? '進貨' : '出貨'}失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 門市對調功能
  async function doTransfer() {
    if (transferState.fromLocationId === '' || transferState.toLocationId === '') {
      alert('請選擇來源門市和目標門市')
      return
    }
    if (transferState.files.length === 0) {
      alert('請選擇PDF檔案')
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
  // Excel導入功能 - 完全修復版本
async function doExcelImport() {
  if (excelImportState.files.length === 0) {
    alert('請選擇Excel檔案')
    return
  }
  
  // 檢查文件大小
  const totalSize = excelImportState.files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > 10 * 1024 * 1024) { // 10MB限制
    alert('文件總大小超過10MB，請使用較小的文件')
    return
  }
  
  try {
    // 显示处理中提示
    const processingMsg = '正在處理Excel文件，請稍候...\n這可能需要幾分鐘時間，請不要關閉頁面。'
    alert(processingMsg)
    
    const form = new FormData()
    excelImportState.files.forEach(f => form.append('files', f))
    
    // 使用更长的超时时间
    const response = await api.post('/import/excel', form, {
      timeout: 300000, // 5分钟超时
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    // 显示详细结果
    const resultMsg = `Excel導入完成！
    
處理行數: ${response.data.processed}
匹配產品: ${response.data.matched}
新增產品: ${response.data.created}
更新產品: ${response.data.updated}
錯誤數量: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '錯誤詳情:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '無錯誤'}`
    
    alert(resultMsg)
    setExcelImportOpen(false)
    await load()
  } catch (error: any) {
    console.error('Excel導入錯誤:', error)
    
    let errorMsg = 'Excel導入失敗：'
    if (error.code === 'ECONNABORTED') {
      errorMsg += '處理超時，請嘗試使用較小的文件或檢查網絡連接'
    } else if (error.response?.status === 413) {
      errorMsg += '文件太大，請使用較小的文件'
    } else if (error.response?.data?.message) {
      errorMsg += error.response.data.message
    } else {
      errorMsg += error.message
    }
    
    alert(errorMsg)
  }
}

  // 編輯和刪除處理函數
  function handleEdit(product: Product) {
    setEditingProduct(product._id)
    setEditForm({
      name: product.name,
      productCode: product.productCode,
      productType: product.productType,
      size: getProductSize(product),
      price: product.price,
      inventories: (product.inventories || []).map(inv => ({
        locationId: typeof inv.locationId === 'object' ? inv.locationId._id : inv.locationId.toString(),
        quantity: inv.quantity
      }))
    })
  }

  function handleCancelEdit() {
    setEditingProduct(null)
    setEditForm({
      name: '',
      productCode: '',
      productType: '',
      size: '',
      price: 0,
      inventories: []
    })
  }

  async function handleSaveEdit(productId: string) {
    try {
      const response = await api.put(`/products/${productId}`, editForm)
      alert('商品更新成功')
      setEditingProduct(null)
      await load()
    } catch (error: any) {
      alert(`更新失敗：${error.response?.data?.message || error.message}`)
    }
  }

  async function handleDelete(product: Product) {
    if (confirm(`確定要刪除產品 "${product.name}" 嗎？`)) {
      try {
        await api.delete(`/products/${product._id}`)
        alert('商品刪除成功')
        await load()
      } catch (error: any) {
        alert(`刪除失敗：${error.response?.data?.message || error.message}`)
      }
    }
  }

  // Group products by name and productCode
  const groupedProducts = (filteredProducts || []).reduce((groups, product) => {
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
            {(productTypes || []).map(type => (
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
              {(locations || []).map(location => (
                <th key={location._id} onClick={() => handleSort(location._id)} style={{ cursor: 'pointer' }}>
                  {location.name} {getSortIcon(location._id)}
                </th>
              ))}
              <th onClick={() => handleSort('total')} style={{ cursor: 'pointer' }}>
                總計 {getSortIcon('total')}
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts || {}).map((group: ProductGroup) => (
              <React.Fragment key={group.key}>
                <tr className="group-header" onClick={() => toggleGroup(group.key)}>
                  <td colSpan={locations.length + 4} style={{ cursor: 'pointer' }}>
                    {expandedGroups.has(group.key) ? '▼' : '▶'} {group.name} ({group.productCode})
                  </td>
                </tr>
                {expandedGroups.has(group.key) && (group.products || []).map((product: Product) => (
                  <tr key={product._id}>
                    {editingProduct === product._id ? (
                      // 編輯模式
                      <>
                        <td>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editForm.productCode}
                            onChange={e => setEditForm(prev => ({ ...prev, productCode: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editForm.size}
                            onChange={e => setEditForm(prev => ({ ...prev, size: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </td>
                        {(locations || []).map(location => {
                          const inventory = editForm.inventories.find(inv => inv.locationId === location._id)
                          return (
                            <td key={location._id}>
                              <input
                                type="number"
                                value={inventory?.quantity || 0}
                                onChange={e => {
                                  const newInventories = editForm.inventories.filter(inv => inv.locationId !== location._id)
                                  if (parseInt(e.target.value) > 0) {
                                    newInventories.push({ locationId: location._id, quantity: parseInt(e.target.value) })
                                  }
                                  setEditForm(prev => ({ ...prev, inventories: newInventories }))
                                }}
                                style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                              />
                            </td>
                          )
                        })}
                        <td>{(editForm.inventories || []).reduce((sum, inv) => sum + inv.quantity, 0)}</td>
                        <td>
                          <div className="actions">
                            <button className="btn" onClick={() => handleSaveEdit(product._id)}>保存</button>
                            <button className="btn secondary" onClick={handleCancelEdit}>取消</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // 顯示模式
                      <>
                        <td>{product.name}</td>
                        <td>{product.productCode}</td>
                        <td>{getProductSize(product)}</td>
                        {(locations || []).map(location => (
                          <td key={location._id}>{getQuantity(product, location._id)}</td>
                        ))}
                        <td>{getTotalQuantity(product)}</td>
                        <td>
                          <div className="actions">
                            <button className="btn ghost" onClick={() => handleEdit(product)}>編輯</button>
                            <button className="btn ghost" onClick={() => handleDelete(product)}>刪除</button>
                          </div>
                        </td>
                      </>
                    )}
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
                  {(locations || []).map(location => (
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
                  {(locations || []).map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>目標門市：</p>
                <select value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">請選擇目標門市</option>
                  {(locations || []).map(location => (
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






