import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

interface Location {
  _id: string
  name: string
}

interface ProductType {
  _id: string
  name: string
}

interface Product {
  _id: string
  name: string
  productCode: string
  productType: string
  size?: string
  sizes?: string[]
  price: number
  inventories: Array<{
    locationId: string | { _id: string }
    quantity: number
  }>
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
  const [loading, setLoading] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null)
  const [groupEditForm, setGroupEditForm] = useState({
    name: '',
    productCode: ''
  })
  
  // 導入庫存狀態
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; files: File[] }>({ locationId: '', files: [] })
  
  // 門市對調狀態
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferState, setTransferState] = useState<{ fromLocationId: string; toLocationId: string; files: File[] }>({ fromLocationId: '', toLocationId: '', files: [] })
  
  // Excel導入狀態
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [excelImportState, setExcelImportState] = useState<{ files: File[] }>({ files: [] })
  
  // 清零庫存狀態
  const [clearOpen, setClearOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferQuantity, setTransferQuantity] = useState(1)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

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

  // 載入數據
  async function load() {
    setLoading(true)
    try {
      const [locationsRes, productsRes] = await Promise.all([
        api.get('/locations'),
        api.get('/products')
      ])
      
      // 按照指定順序排序：觀塘，灣仔，荔枝角，元朗，國内倉
      const order = ['觀塘', '灣仔', '荔枝角', '元朗', '國内倉']
      const sortedLocations = locationsRes.data.sort((a: Location, b: Location) => {
        const aIndex = order.indexOf(a.name)
        const bIndex = order.indexOf(b.name)
        return aIndex - bIndex
      })
      
      setLocations(sortedLocations)
      setProducts(productsRes.data)
    } catch (error) {
      console.error('載入數據失敗:', error)
      alert('載入數據失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  async function loadProductTypes() {
    try {
      const response = await api.get('/product-types')
      setProductTypes(response.data || [])
    } catch (error) {
      console.error('載入產品類型失敗:', error)
    }
  }

  useEffect(() => {
    load()
    loadProductTypes()
  }, [])

  // 篩選和搜索邏輯
  useEffect(() => {
    let filtered = [...products]

    // 按產品類型篩選
    if (selectedType) {
      filtered = filtered.filter(p => p.productType === selectedType)
    }

    // 按搜索詞篩選
    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getProductSize(p).toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 排序
    if (sortBy) {
      filtered.sort((a, b) => {
        let aVal, bVal
        switch (sortBy) {
          case 'productCode':
            aVal = a.productCode
            bVal = b.productCode
            break
          case 'name':
            aVal = a.name
            bVal = b.name
            break
          case 'productType':
            aVal = a.productType
            bVal = b.productType
            break
          case 'size':
            aVal = getProductSize(a)
            bVal = getProductSize(b)
            break
          case 'price':
            aVal = a.price
            bVal = b.price
            break
          default:
            return 0
        }

        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
        return 0
      })
    }

    setFilteredProducts(filtered)
  }, [products, selectedType, searchTerm, sortBy, sortOrder])

  function getProductSize(product: Product): string {
    if (product.sizes && Array.isArray(product.sizes)) {
      return product.sizes.join(', ')
    }
    return product.size || ''
  }

  // 修復後的 getQuantity 函數 - 加入 null 檢查
  function getQuantity(product: Product, locationId: string): number {
    if (!product.inventories || !Array.isArray(product.inventories)) {
      return 0
    }
    const inventory = product.inventories.find(inv => {
      // 檢查 locationId 是否為 null 或 undefined
      if (!inv.locationId) {
        return false
      }
      
      // 處理 populate 後的 locationId 對象
      if (typeof inv.locationId === 'object' && inv.locationId !== null) {
        return inv.locationId._id === locationId || inv.locationId._id.toString() === locationId
      }
      
      // 處理字符串 ObjectId 的比較，加入 null 檢查
      if (inv.locationId && typeof inv.locationId === 'string') {
        return inv.locationId === locationId || inv.locationId.toString() === locationId
      }
      
      return false
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

  // 按尺寸排序產品
  function sortProductsBySize(products: Product[]): Product[] {
    return products.sort((a, b) => {
      const sizeA = getProductSize(a)
      const sizeB = getProductSize(b)
      
      // 提取數字進行比較
      const numA = parseInt(sizeA.match(/\d+/)?.[0] || '0')
      const numB = parseInt(sizeB.match(/\d+/)?.[0] || '0')
      
      return numA - numB
    })
  }

  // 切換組展開/收縮
  function toggleGroup(groupKey: string) {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedGroups(newExpanded)
  }

  // 修改後的Excel匯出功能
  function exportToExcel() {
    try {
      // 準備數據
      const exportData = []
      
      // 添加標題行
      exportData.push(['產品代碼', '產品名稱', '產品類型', '尺寸', '價格', ...locations.map(l => l.name), '總庫存'])
      
      // 按組分組並添加產品數據
      const groupedProducts = (filteredProducts || []).reduce((groups, product) => {
        const baseCode = product.productCode.split('-')[0] + '-' + product.productCode.split('-')[1]
        const groupKey = baseCode
        if (!groups[groupKey]) {
          groups[groupKey] = {
            key: groupKey,
            name: baseCode,
            productCode: baseCode,
            products: []
          }
        }
        groups[groupKey].products.push(product)
        return groups
      }, {} as Record<string, ProductGroup>)

      Object.values(groupedProducts).forEach(group => {
        const sortedProducts = sortProductsBySize([...group.products])
        sortedProducts.forEach(product => {
          const row = [
            product.productCode,
            product.name,
            product.productType,
            getProductSize(product),
            product.price,
            ...locations.map(location => getQuantity(product, location._id)),
            getTotalQuantity(product)
          ]
          exportData.push(row)
        })
      })
      
      // 創建工作表
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '庫存報表')
      
      // 生成文件名
      const now = new Date()
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-')
      const filename = `庫存報表_${timestamp}.xlsx`
      
      // 導出文件
      XLSX.writeFile(wb, filename)
      
      alert('Excel文件導出成功！')
    } catch (error) {
      console.error('導出Excel失敗:', error)
      alert('匯出Excel失敗，請重試')
    }
  }

  // 導入處理函數
  async function doImport(type: 'incoming' | 'outgoing') {
    if (!importState.files || importState.files.length === 0) {
      alert('請選擇文件')
      return
    }
    if (!importState.locationId) {
      alert('請選擇地點')
      return
    }

    const formData = new FormData()
    importState.files.forEach(file => {
      formData.append('files', file)
    })
    formData.append('locationId', importState.locationId)

    try {
      setLoading(true)
      const response = await api.post(`/import/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      const resultMsg = `${type === 'incoming' ? '進貨' : '出貨'}完成！
      
處理文件: ${response.data.files || 0}
處理商品: ${response.data.processed || 0}
匹配成功: ${response.data.matched || 0}
更新成功: ${response.data.updated || 0}
未找到: ${response.data.notFound?.length || 0}

${response.data.notFound?.length ? '未找到商品:\n' + response.data.notFound.join('\n') : ''}`
      
      alert(resultMsg)
      setImportOpen(false)
      setImportState({ locationId: '', files: [] })
      await load()
    } catch (error: any) {
      console.error('導入錯誤:', error)
      alert(`導入失敗: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 調貨功能
  async function doTransfer() {
    if (!transferState.fromLocationId || !transferState.toLocationId || !transferState.files || transferState.files.length === 0) {
      alert('請填寫完整信息')
      return
    }

    if (transferState.fromLocationId === transferState.toLocationId) {
      alert('來源和目標門市不能相同')
      return
    }

    const formData = new FormData()
    transferState.files.forEach(file => {
      formData.append('files', file)
    })
    formData.append('fromLocationId', transferState.fromLocationId)
    formData.append('toLocationId', transferState.toLocationId)

    try {
      setLoading(true)
      const response = await api.post('/import/transfer', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      alert(`門市對調完成！處理了${response.data.processed || 0}個產品`)
      setTransferOpen(false)
      setTransferState({ fromLocationId: '', toLocationId: '', files: [] })
      await load()
    } catch (error: any) {
      console.error('調貨錯誤:', error)
      alert(`調貨失敗: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Excel導入功能
  async function doExcelImport() {
    if (!excelImportState.files || excelImportState.files.length === 0) {
      alert('請選擇Excel文件')
      return
    }

    const totalSize = excelImportState.files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > 50 * 1024 * 1024) { // 50MB limit
      alert('文件總大小不能超過50MB')
      return
    }

    const formData = new FormData()
    excelImportState.files.forEach(file => {
      formData.append('files', file)
    })

    try {
      setLoading(true)
      const response = await api.post('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      alert(`Excel導入完成！處理了${response.data.processed || 0}個產品`)
      setExcelImportOpen(false)
      setExcelImportState({ files: [] })
      await load()
    } catch (error: any) {
      console.error('Excel導入錯誤:', error)
      alert(`Excel導入失敗: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 清零庫存功能
  async function doClearAll() {
    if (!selectedLocation) {
      alert('請選擇門市')
      return
    }

    if (!confirm(`確定要清零${locations.find(l => l._id === selectedLocation)?.name}的所有庫存嗎？此操作不可逆！`)) {
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/clear', { locationId: selectedLocation })
      alert(`清零完成！已清空${response.data.cleared || 0}個產品的庫存`)
      setClearOpen(false)
      setSelectedLocation('')
      await load()
    } catch (error: any) {
      console.error('清零錯誤:', error)
      alert(`清零失敗: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 編輯組處理
  function handleEditGroup(group: ProductGroup) {
    setEditingGroup(group)
    setGroupEditForm({
      name: group.name,
      productCode: group.products[0]?.productCode || ''
    })
  }

  function handleCancelGroupEdit() {
    setEditingGroup(null)
    setGroupEditForm({ name: '', productCode: '' })
  }

  async function handleSaveGroupEdit(group: ProductGroup) {
    try {
      // 更新所有產品的產品代碼
      for (const product of group.products) {
        await api.put(`/products/${product._id}`, {
          productCode: groupEditForm.productCode
        })
      }
      alert('產品代碼更新成功！')
      setEditingGroup(null)
      await load()
    } catch (error: any) {
      console.error('更新失敗:', error)
      alert(`更新失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 產品編輯功能
  function handleEdit(product: Product) {
    setEditingProduct(product._id)
    setEditForm({
      name: product.name,
      productCode: product.productCode,
      productType: product.productType,
      size: getProductSize(product),
      price: product.price,
      inventories: (product.inventories || []).map(inv => ({
        locationId: typeof inv.locationId === 'object' && inv.locationId !== null 
          ? inv.locationId._id 
          : (inv.locationId ? inv.locationId.toString() : ''),
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
      alert('產品更新成功！')
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
        alert('產品刪除成功！')
        await load()
      } catch (error: any) {
        alert(`刪除失敗：${error.response?.data?.message || error.message}`)
      }
    }
  }

  // 按組分組產品
  const groupedProducts = (filteredProducts || []).reduce((groups, product) => {
    const baseCode = product.productCode.split('-')[0] + '-' + product.productCode.split('-')[1]
    const groupKey = baseCode
    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: groupKey,
        name: baseCode,
        productCode: baseCode,
        products: []
      }
    }
    groups[groupKey].products.push(product)
    return groups
  }, {} as Record<string, ProductGroup>)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">載入中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">庫存管理</h1>
        
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
        <button className="btn" onClick={exportToExcel}>匯出Excel</button>
        <button className="btn" onClick={() => setClearOpen(true)}>清零庫存</button>
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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts).map((group: ProductGroup) => (
              <React.Fragment key={group.key}>
                <tr className="group-header" onClick={() => toggleGroup(group.key)}>
                  <td colSpan={locations.length + 4} style={{ cursor: 'pointer' }}>
                    {expandedGroups.has(group.key) ? '▼' : '▶'} {group.name} ({group.productCode})
                  </td>
                </tr>
                {expandedGroups.has(group.key) && group.products.map((product: Product) => (
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
                        {locations.map(location => {
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
                        {locations.map(location => (
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

      {/* 清零庫存彈窗 */}
      {clearOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">清零庫存</div>
            <div className="body">
              <div>
                <p>選擇門市：</p>
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
                  <option value="">請選擇門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-red-600">警告：此操作將清空所選門市的所有庫存，且不可逆！</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setClearOpen(false)}>取消</button>
              <button className="btn bg-red-500 hover:bg-red-600" onClick={doClearAll}>確認清零</button>
            </div>
          </div>
        </div>
      )}

      {/* 組編輯彈窗 */}
      {editingGroup && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">編輯產品組</div>
            <div className="body">
              <div>
                <p>組名：</p>
                <input
                  type="text"
                  value={groupEditForm.name}
                  onChange={(e) => setGroupEditForm({...groupEditForm, name: e.target.value})}
                  className="w-full px-2 py-1 border rounded"
                />
              </div>
              <div>
                <p>產品代碼：</p>
                <input
                  type="text"
                  value={groupEditForm.productCode}
                  onChange={(e) => setGroupEditForm({...groupEditForm, productCode: e.target.value})}
                  className="w-full px-2 py-1 border rounded"
                />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={handleCancelGroupEdit}>取消</button>
              <button className="btn" onClick={() => handleSaveGroupEdit(editingGroup)}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}