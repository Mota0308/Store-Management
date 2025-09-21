import React, { useState, useEffect } from 'react'
import api from '../api'
import * as XLSX from 'xlsx'

// 定義介面
interface Location {
  _id: string
  name: string
}

interface ProductType {
  _id: string
  name: string
}

interface Inventory {
  locationId: string | { _id: string; name: string } | null // 添加 null 類型
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
  const [sizeSearchTerm, setSizeSearchTerm] = useState('') // 新添加這行
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Mobile detection & controls
  const [isMobile, setIsMobile] = useState<boolean>(false)
  const [mobileControlsOpen, setMobileControlsOpen] = useState<boolean>(false)

  // 新增群組編輯狀態
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [groupEditForm, setGroupEditForm] = useState<{
    name: string
    productCode: string
  }>({
    name: '',
    productCode: ''
  })

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile((e as MediaQueryList).matches ?? (e as any).matches)
    // initialize
    setIsMobile(mq.matches)
    // subscribe
    mq.addEventListener ? mq.addEventListener('change', handler as any) : mq.addListener(handler as any)
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', handler as any) : mq.removeListener(handler as any)
    }
  }, [])
  
  // 導入庫存狀態
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; files: File[] }>({ locationId: '', files: [] })
  
  // 轉移庫存狀態
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferState, setTransferState] = useState<{ fromLocationId: string; toLocationId: string; files: File[] }>({ fromLocationId: '', toLocationId: '', files: [] })
  
  // Excel導入狀態
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [excelImportState, setExcelImportState] = useState<{ files: File[] }>({ files: [] })

  // 清零狀態
  const [clearOpen, setClearOpen] = useState(false)
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
      // 按照固定順序排列：進貨、上架、庫存調、觀塘、灣仔、荔枝角、元朗、國內倉、總庫
      const order = ['進貨', '上架', '庫存調', '觀塘', '灣仔', '荔枝角', '元朗', '國內倉', '總庫'];
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
  }, [products, selectedType, searchTerm, sizeSearchTerm, sortBy, sortOrder]) // 添加 sizeSearchTerm

  async function loadProductTypes() {
      const response = await api.get('/product-types')
    setProductTypes(response.data || [])
  }

  async function load() {
    const response = await api.get('/products')
    // 確保返回的數據結構是 { products: [...], pagination: {...} }
    setProducts(response.data.products || [])
  }

  useEffect(() => {
    let filtered = products || [] // 添加空值檢查

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

    // Filter by size search term - 正則法則（部分匹配）
    if (sizeSearchTerm) {
      filtered = filtered.filter(p => 
        getProductSize(p).toLowerCase().includes(sizeSearchTerm.toLowerCase())
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
  }, [products, selectedType, searchTerm, sizeSearchTerm, sortBy, sortOrder]) // 添加 sizeSearchTerm

  function getProductSize(product: Product): string {
    if (product.sizes && product.sizes.length > 0) {
      return product.sizes.join(', ')
    }
    return product.size || ''
  }

  // 新增產品尺寸排序邏輯
  function sortProductsBySize(products: Product[]): Product[] {
    return products.sort((a, b) => {
      const aSize = getProductSize(a)
      const bSize = getProductSize(b)
      
      // 提取數字進行排序
      const aNumbers = aSize.match(/\d+/g) || []
      const bNumbers = bSize.match(/\d+/g) || []
      
      // 如果有數字，比較第一個數字
      if (aNumbers.length > 0 && bNumbers.length > 0) {
        const aNum = parseInt(aNumbers[0] || '0')
        const bNum = parseInt(bNumbers[0] || '0')
        return aNum - bNum
      }
      
      // 如果只有一個有數字，數字在前
      if (aNumbers.length > 0 && bNumbers.length === 0) return -1
      if (aNumbers.length === 0 && bNumbers.length > 0) return 1
      
      // 都沒數字，按字母排序
      return aSize.localeCompare(bSize)
    })
  }

  // 確保添加 null 檢查
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
      
      // 處理字符串 ObjectId 的情況，添加 null 檢查
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
    if (sortBy !== column) return '?'
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  // 新增群組編輯功能
  function handleEditGroup(group: ProductGroup) {
    setEditingGroup(group.key)
    setGroupEditForm({
      name: group.name,
      productCode: group.productCode
    })
  }

  function handleCancelGroupEdit() {
    setEditingGroup(null)
    setGroupEditForm({
      name: '',
      productCode: ''
    })
  }

  // 新增群組編輯保存 - 批量更新所有產品
  async function handleSaveGroupEdit(group: ProductGroup) {
    try {
      // 批量更新該群組內所有產品的名稱和產品代碼
      const updatePromises = group.products.map(product => 
        api.put(`/products/${product._id}`, {
          name: groupEditForm.name,
          productCode: groupEditForm.productCode,
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
      )
      
      await Promise.all(updatePromises)
      alert(`產品組 "${group.name}" 更新成功！共更新 ${group.products.length} 個產品`)
      setEditingGroup(null)
      await load()
    } catch (error: any) {
      alert(`更新失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // Excel導出功能（包含分組和排序）
  function exportToExcel() {
    try {
      const exportData = []
      const headers = ['產品', '商品', '尺寸', '進貨', '上架', '庫存調', '觀塘', '灣仔', '荔枝角', '元朗', '國內倉', '總庫']
      exportData.push(headers)
      Object.values(groupedProducts).forEach(group => {
        const sortedProducts = sortProductsBySize([...group.products])
        sortedProducts.forEach(product => {
          const row = [
            product.productCode,
            product.name,
            getProductSize(product),
            getQuantity(product, locations.find(l => l.name === '進貨')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '上架')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '庫存調')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '觀塘')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '灣仔')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '荔枝角')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '元朗')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '國內倉')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '總庫')?._id || '')
          ]
          exportData.push(row)
        })
      })
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '庫存管理')
      const now = new Date()
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-')
      const filename = `庫存管理_${timestamp}.xlsx`
      XLSX.writeFile(wb, filename)
      alert('Excel導出成功！')
    } catch (error) {
      console.error('導出Excel錯誤:', error)
      alert('導出Excel失敗，請重試')
    }
  }

  // 導入處理函數（doImport / doTransfer / doExcelImport / doClearAll / 編輯）
  async function doImport(type: 'incoming' | 'outgoing') {
    if (importState.locationId === '') {
      alert('請選擇地點')
      return
    }
    if (importState.files.length === 0) {
      alert('請選擇PDF文件')
      return
    }
    
    try {
      const form = new FormData()
      form.append('locationId', importState.locationId)
      importState.files.forEach(f => form.append('files', f))
      
      // 確保根據type調用正確的API端點
      const response = await api.post(`/import/${type}`, form)
      alert(`${type === 'incoming' ? '進貨' : '出貨'}成功！\n處理:${response.data.processed}  匹配:${response.data.matched}  新增:${response.data.created}  更新:${response.data.updated}\n未找到: ${response.data.notFound?.join(', ') || '無'}`)
      setImportOpen(false)
      await load()
    } catch (error: any) {
      alert(`${type === 'incoming' ? '進貨' : '出貨'}失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 轉移庫存處理
  async function doTransfer() {
    if (transferState.fromLocationId === '' || transferState.toLocationId === '') {
      alert('請選擇來源地點和目標地點')
      return
    }
    if (transferState.files.length === 0) {
      alert('請選擇PDF文件')
      return
    }
    
    try {
      const form = new FormData()
      form.append('fromLocationId', transferState.fromLocationId)
      form.append('toLocationId', transferState.toLocationId)
      transferState.files.forEach(f => form.append('files', f))
      
      const response = await api.post('/import/transfer', form)
      alert(`轉移庫存成功！\n處理:${response.data.processed}  匹配:${response.data.matched}  更新:${response.data.updated}\n未找到: ${response.data.notFound?.join(', ') || '無'}`)
      setTransferOpen(false)
      await load()
    } catch (error: any) {
      alert(`轉移庫存失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // Excel導入處理 - 添加錯誤處理
  async function doExcelImport() {
    if (excelImportState.files.length === 0) {
      alert('請選擇Excel文件')
      return
    }
    
    // 檢查文件大小
    const totalSize = excelImportState.files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > 10 * 1024 * 1024) { // 10MB限制
      alert('文件太大超過10MB，請選擇較小文件')
      return
    }
    
    try {
      // 顯示處理中消息
      const processingMsg = '正在處理Excel文件，請稍候...\n這可能需要一些時間，請不要關閉頁面。'
      alert(processingMsg)
      
      const form = new FormData()
      excelImportState.files.forEach(f => form.append('files', f))
      
      // 設置較長的超時時間
      const response = await api.post('/import/excel', form, {
        timeout: 300000, // 5分鐘超時
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      // 顯示結果
      const resultMsg = `Excel導入成功！
      
處理文件: ${response.data.processed}
匹配商品: ${response.data.matched}
新增商品: ${response.data.created}
更新商品: ${response.data.updated}
錯誤數量: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '錯誤詳情:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '無錯誤'}`

      alert(resultMsg)
      setExcelImportOpen(false)
      await load()
    } catch (error: any) {
      console.error('Excel導入錯誤:', error)
      
      let errorMsg = 'Excel導入失敗：'
      if (error.code === 'ECONNABORTED') {
        errorMsg += '處理超時，請選擇較小文件或檢查網絡連接'
      } else if (error.response?.status === 413) {
        errorMsg += '文件太大，請選擇較小文件'
      } else if (error.response?.data?.message) {
        errorMsg += error.response.data.message
      } else {
        errorMsg += error.message
      }
      
      alert(errorMsg)
    }
  }

  // 清零所有庫存數量
  async function doClearAll() {
    if (!confirm('確定要清零所有庫存嗎？此操作無法撤銷！')) {
      return
    }
    
    try {
      const response = await api.post('/import/clear')
      
      const resultMsg = `清零成功！
      
處理商品: ${response.data.processed}
更新商品: ${response.data.updated}
錯誤數量: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '錯誤詳情:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '無錯誤'}`

      alert(resultMsg)
      setClearOpen(false)
      await load()
    } catch (error: any) {
      console.error('清零錯誤:', error)
      
      let errorMsg = '清零失敗：'
      if (error.response?.data?.message) {
        errorMsg += error.response.data.message
      } else {
        errorMsg += error.message
      }
      
      alert(errorMsg)
    }
  }

  // 編輯和刪除處理函數 - 添加錯誤處理
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
      alert('商品更新成功')
      setEditingProduct(null)
      await load()
    } catch (error: any) {
      alert(`更新失敗：${error.response?.data?.message || error.message}`)
    }
  }

  async function handleDelete(product: Product) {
    if (confirm(`確定要刪除商品 "${product.name}" 嗎？`)) {
      try {
        await api.delete(`/products/${product._id}`)
        alert('商品刪除成功')
        await load()
      } catch (error: any) {
        alert(`刪除失敗：${error.response?.data?.message || error.message}`)
      }
    }
  }

  // 刪除整個產品組
  async function handleDeleteGroup(group: ProductGroup) {
    if (confirm(`確定要刪除產品組 "${group.name}" (${group.productCode}) 嗎？\n這將刪除該組內所有產品，此操作無法撤銷！`)) {
      try {
        // 批量刪除該組內所有產品
        const deletePromises = group.products.map(product => 
          api.delete(`/products/${product._id}`)
        )
        
        await Promise.all(deletePromises)
        alert(`產品組 "${group.name}" 刪除成功，共刪除 ${group.products.length} 個產品`)
        await load()
      } catch (error: any) {
        alert(`刪除失敗：${error.response?.data?.message || error.message}`)
      }
    }
  }

  // Group products by name and productCode，按尺寸排序
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

  // 對每個群組內的產品按尺寸排序
  Object.values(groupedProducts).forEach(group => {
    group.products = sortProductsBySize(group.products)
  })

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
        {isMobile && (
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMobileControlsOpen(o => !o)}>
              {mobileControlsOpen ? '隱藏控制' : '顯示控制'}
            </button>
          </div>
        )}
      </div>

      {(!isMobile || mobileControlsOpen) && (
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

            <input
              type="text"
              placeholder="搜尋尺寸..."
              value={sizeSearchTerm}
              onChange={e => setSizeSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="spacer" />
          <button className="btn" onClick={exportToExcel}>導出Excel</button>
          <button className="btn" onClick={() => setExcelImportOpen(true)}>導入Excel</button>
          <button className="btn" onClick={() => setClearOpen(true)}>清零</button>
          <button className="btn" onClick={() => setImportOpen(true)}>導入庫存</button>
          <button className="btn" onClick={() => setTransferOpen(true)}>庫存轉移</button>
        </div>
      )}

      {/* 表格容器：包含標題和數據，無需滾動 */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>產品</th>
              <th>代碼</th>
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
            {Object.values(groupedProducts).map((group: ProductGroup, groupIndex) => (
              <React.Fragment key={group.key}>
                <tr className="group-header" style={{ borderBottom: '2px solid #dc2626' }}>
                  <td colSpan={locations.length + 3} style={{ cursor: 'pointer' }} onClick={() => toggleGroup(group.key)}>
                    {expandedGroups.has(group.key) ? '▼' : '▶'} {group.name} ({group.productCode})
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {editingGroup === group.key ? (
                        // 編輯模式
                        <>
                          <button 
                            className="btn" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSaveGroupEdit(group)
                            }}
                            style={{ 
                              backgroundColor: '#10b981', 
                              color: 'white', 
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            保存
                          </button>
                          <button 
                            className="btn" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancelGroupEdit()
                            }}
                            style={{ 
                              backgroundColor: '#6b7280', 
                              color: 'white', 
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        // 正常模式
                        <>
                          <button 
                            className="btn" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditGroup(group)
                            }}
                            style={{ 
                              backgroundColor: '#3b82f6', 
                              color: 'white', 
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            編輯
                          </button>
                          <button 
                            className="btn danger" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteGroup(group)
                            }}
                            style={{ 
                              backgroundColor: '#dc2626', 
                              color: 'white', 
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            刪除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedGroups.has(group.key) && (
                  editingGroup === group.key ? (
                    // 編輯模式 - 顯示編輯表單
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <td>
                        <input
                          type="text"
                          value={groupEditForm.name}
                          onChange={e => setGroupEditForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="產品名稱"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={groupEditForm.productCode}
                          onChange={e => setGroupEditForm(prev => ({ ...prev, productCode: e.target.value }))}
                          placeholder="產品代碼"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                      </td>
                      <td colSpan={locations.length + 2} style={{ textAlign: 'center', color: '#6b7280' }}>
                        編輯模式 - 修改產品名稱和代碼將更新該組內所有產品
                      </td>
                    </tr>
                  ) : null
                )}
                {expandedGroups.has(group.key) && group.products.map((product: Product, productIndex) => (
                  <tr 
                    key={product._id} 
                    style={{ 
                      borderBottom: productIndex === group.products.length - 1 ? '2px solid #dc2626' : '1px solid #dc2626'
                    }}
                  >
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
                      // 正常模式 - 顯示產品數據
                      <>
                        <td className="right">{product.name}</td>
                        <td>{product.productCode}</td>
                        <td>{getProductSize(product)}</td>
                        {locations.map(location => {
                          const quantity = getQuantity(product, location._id)
                          return (
                            <td 
                              key={location._id} 
                              className={quantity > 0 ? 'highlight-cell' : ''}
                            >
                              {quantity}
                            </td>
                          )
                        })}
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
                <p>選擇地點：</p>
                <select value={importState.locationId} onChange={e => setImportState(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">請選擇地點</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>選擇PDF文件：</p>
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

      {/* 庫存轉移彈窗 */}
      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">庫存轉移</div>
            <div className="body">
              <div>
                <p>來源地點：</p>
                <select value={transferState.fromLocationId} onChange={e => setTransferState(s => ({ ...s, fromLocationId: e.target.value }))}>
                  <option value="">請選擇來源地點</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>目標地點：</p>
                <select value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">請選擇目標地點</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>選擇PDF文件：</p>
                <input multiple type="file" accept=".pdf" onChange={e => setTransferState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>取消</button>
              <button className="btn" onClick={doTransfer}>開始</button>
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
                  <li>每列：產品代碼、產品名稱、產品類型、尺寸、進貨、上架、庫存調、觀塘、灣仔、荔枝角、元朗、國內倉、總庫</li>
                  <li>產品代碼：產品代碼（如：產品代碼、商品代碼、產品、代碼、商品）</li>
                  <li>產品名稱：產品名稱（如：產品名稱、名稱、產品、名稱、商品）</li>
                  <li>產品類型：尺寸（如：尺寸、大小、上架、尺寸、規格）</li>
                  <li>下下列：對應庫存數量（如：進貨數量、上架數量）</li>
                </ul>
              </div>
              <div>
                <p>選擇Excel文件：</p>
                <input multiple type="file" accept=".xlsx,.xls" onChange={e => setExcelImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setExcelImportOpen(false)}>取消</button>
              <button className="btn" onClick={doExcelImport}>開始導入</button>
            </div>
          </div>
        </div>
      )}

      {/* 清零確認彈窗 */}
      {clearOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">清零所有庫存數量</div>
            <div className="body">
              <p>⚠️ 警告：此操作將清零所有庫存數量（設為0），此操作無法撤銷！</p>
              <p>確定要繼續嗎？</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setClearOpen(false)}>取消</button>
              <button className="btn danger" onClick={doClearAll}>確定清零</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
