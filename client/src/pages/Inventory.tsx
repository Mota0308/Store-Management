import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import api from '../api'

interface Location {
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
  name: string
  products: Product[]
}

export default function Inventory() {
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [groupedProducts, setGroupedProducts] = useState<Record<string, ProductGroup>>({})
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null)
  const [groupEditForm, setGroupEditForm] = useState({
    name: '',
    productCode: ''
  })
  const [importOpen, setImportOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferQuantity, setTransferQuantity] = useState(1)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // 載入數據
  async function load() {
    setLoading(true)
    try {
      const [locationsRes, productsRes] = await Promise.all([
        api.get('/locations'),
        api.get('/products')
      ])
      setLocations(locationsRes.data)
      setProducts(productsRes.data)
      
      // 按產品代碼分組
      const grouped: Record<string, ProductGroup> = {}
      productsRes.data.forEach((product: Product) => {
        const baseCode = product.productCode.split('-')[0] + '-' + product.productCode.split('-')[1]
        if (!grouped[baseCode]) {
          grouped[baseCode] = {
            name: baseCode,
            products: []
          }
        }
        grouped[baseCode].products.push(product)
      })
      setGroupedProducts(grouped)
    } catch (error) {
      console.error('載入數據失敗:', error)
      alert('載入數據失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

  // 修改後的Excel匯出功能
  function exportToExcel() {
    try {
      // 準備數據
      const exportData = []
      
      // 添加標題行
      exportData.push(['產品代碼', '產品名稱', '產品類型', '尺寸', '價格', ...locations.map(l => l.name), '總庫存'])
      
      // 添加產品數據
      Object.values(groupedProducts).forEach(group => {
        group.products.forEach(product => {
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
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('請選擇文件')
      return
    }
    if (!selectedLocation) {
      alert('請選擇地點')
      return
    }

    const formData = new FormData()
    Array.from(selectedFiles).forEach(file => {
      formData.append('files', file)
    })
    formData.append('locationId', selectedLocation)

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
      setSelectedFiles(null)
      setSelectedLocation('')
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
    if (!transferFrom || !transferTo || !selectedProduct || !transferQuantity) {
      alert('請填寫完整信息')
      return
    }

    if (transferFrom === transferTo) {
      alert('來源和目標門市不能相同')
      return
    }

    if (transferQuantity <= 0) {
      alert('調貨數量必須大於0')
      return
    }

    const currentQuantity = getQuantity(selectedProduct, transferFrom)
    if (currentQuantity < transferQuantity) {
      alert(`庫存不足！當前庫存：${currentQuantity}，需要調貨：${transferQuantity}`)
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/transfer', {
        productId: selectedProduct._id,
        fromLocationId: transferFrom,
        toLocationId: transferTo,
        quantity: transferQuantity
      })

      alert(`調貨成功！已從${locations.find(l => l._id === transferFrom)?.name}調貨${transferQuantity}件到${locations.find(l => l._id === transferTo)?.name}`)
      setTransferOpen(false)
      setSelectedProduct(null)
      setTransferFrom('')
      setTransferTo('')
      setTransferQuantity(1)
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
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('請選擇Excel文件')
      return
    }
    if (!selectedLocation) {
      alert('請選擇門市')
      return
    }

    const formData = new FormData()
    Array.from(selectedFiles).forEach(file => {
      formData.append('files', file)
    })
    formData.append('locationId', selectedLocation)
    formData.append('direction', 'incoming')

    try {
      setLoading(true)
      const response = await api.post('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      alert(`Excel導入完成！處理了${response.data.processed || 0}個產品`)
      setExcelImportOpen(false)
      setSelectedFiles(null)
      setSelectedLocation('')
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
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setImportOpen(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            進貨
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            出貨
          </button>
          <button
            onClick={() => setTransferOpen(true)}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            調貨
          </button>
          <button
            onClick={() => setExcelImportOpen(true)}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            Excel導入
          </button>
          <button
            onClick={exportToExcel}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            匯出Excel
          </button>
          <button
            onClick={() => setClearOpen(true)}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            清零庫存
          </button>
        </div>
      </div>

      {/* 庫存表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 border-b text-left">產品代碼</th>
              <th className="px-4 py-2 border-b text-left">產品名稱</th>
              <th className="px-4 py-2 border-b text-left">產品類型</th>
              <th className="px-4 py-2 border-b text-left">尺寸</th>
              <th className="px-4 py-2 border-b text-left">價格</th>
              {locations.map(location => (
                <th key={location._id} className="px-4 py-2 border-b text-center">
                  {location.name}
                </th>
              ))}
              <th className="px-4 py-2 border-b text-center">總庫存</th>
              <th className="px-4 py-2 border-b text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts).map(group => (
              <React.Fragment key={group.name}>
                {group.products.map((product, index) => (
                  <tr key={product._id} className={index === 0 ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-2 border-b">{product.productCode}</td>
                    <td className="px-4 py-2 border-b">{product.name}</td>
                    <td className="px-4 py-2 border-b">{product.productType}</td>
                    <td className="px-4 py-2 border-b">{getProductSize(product)}</td>
                    <td className="px-4 py-2 border-b">${product.price}</td>
                    {locations.map(location => (
                      <td key={location._id} className="px-4 py-2 border-b text-center">
                        {getQuantity(product, location._id)}
                      </td>
                    ))}
                    <td className="px-4 py-2 border-b text-center font-bold">
                      {getTotalQuantity(product)}
                    </td>
                    <td className="px-4 py-2 border-b text-center">
                      <button
                        onClick={() => {
                          setSelectedProduct(product)
                          setTransferOpen(true)
                        }}
                        className="bg-green-500 text-white px-2 py-1 rounded text-sm hover:bg-green-600"
                      >
                        調貨
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 進貨/出貨彈窗 */}
      {importOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">導入庫存</div>
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
              <div>
                <p>選擇PDF檔案：</p>
                <input 
                  multiple 
                  type="file" 
                  accept=".pdf" 
                  onChange={e => setSelectedFiles(e.target.files)} 
                />
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

      {/* 調貨彈窗 */}
      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">調貨</div>
            <div className="body">
              <div>
                <p>選擇產品：</p>
                <select 
                  value={selectedProduct?._id || ''} 
                  onChange={e => {
                    const product = products.find(p => p._id === e.target.value)
                    setSelectedProduct(product || null)
                  }}
                >
                  <option value="">請選擇產品</option>
                  {products.map(product => (
                    <option key={product._id} value={product._id}>
                      {product.productCode} - {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p>來源門市：</p>
                <select value={transferFrom} onChange={e => setTransferFrom(e.target.value)}>
                  <option value="">請選擇來源門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>目標門市：</p>
                <select value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                  <option value="">請選擇目標門市</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>調貨數量：</p>
                <input 
                  type="number" 
                  value={transferQuantity} 
                  onChange={e => setTransferQuantity(parseInt(e.target.value) || 0)}
                  min="1"
                />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>取消</button>
              <button className="btn" onClick={doTransfer}>確認調貨</button>
            </div>
          </div>
        </div>
      )}

      {/* Excel導入彈窗 */}
      {excelImportOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">Excel導入</div>
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
              <div>
                <p>選擇Excel檔案：</p>
                <input 
                  multiple 
                  type="file" 
                  accept=".xlsx,.xls" 
                  onChange={e => setSelectedFiles(e.target.files)} 
                />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setExcelImportOpen(false)}>取消</button>
              <button className="btn" onClick={doExcelImport}>導入</button>
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
    </div>
  )
}