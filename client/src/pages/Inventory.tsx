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
      if (typeof inv.locationId === 'string') {
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
      
      // 提取數字進行排序
      const numA = parseInt(sizeA.match(/\d+/)?.[0] || '0')
      const numB = parseInt(sizeB.match(/\d+/)?.[0] || '0')
      
      return sortOrder === 'asc' ? numA - numB : numB - numA
    })
  }

  // 修改後的Excel匯出功能
  function exportToExcel() {
    try {
      const exportData = []
      const headers = ['產品', '商品', '尺寸', '觀塘', '灣仔', '荔枝角', '元朗', '國內倉', '總庫']
      exportData.push(headers)
      Object.values(groupedProducts).forEach(group => {
        const sortedProducts = sortProductsBySize([...group.products])
        sortedProducts.forEach(product => {
          // 計算各地點的數量
          const kwunTongQty = getQuantity(product, locations.find(l => l.name === '觀塘')?._id || '')
          const wanChaiQty = getQuantity(product, locations.find(l => l.name === '灣仔')?._id || '')
          const laiChiKokQty = getQuantity(product, locations.find(l => l.name === '荔枝角')?._id || '')
          const yuenLongQty = getQuantity(product, locations.find(l => l.name === '元朗')?._id || '')
          const domesticQty = getQuantity(product, locations.find(l => l.name === '國內倉')?._id || '')
          
          // 計算總庫存（觀塘+灣仔+荔枝角+元朗+國內倉）
          const totalQty = kwunTongQty + wanChaiQty + laiChiKokQty + yuenLongQty + domesticQty
          
          const row = [
            product.productCode,
            product.name,
            getProductSize(product),
            kwunTongQty,
            wanChaiQty,
            laiChiKokQty,
            yuenLongQty,
            domesticQty,
            totalQty
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
      alert('Excel匯出成功')
    } catch (error) {
      console.error('匯出Excel錯誤:', error)
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
    if (!selectedProduct || !transferFrom || !transferTo || transferQuantity <= 0) {
      alert('請填寫完整的調貨信息')
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/products/transfer', {
        productId: selectedProduct._id,
        fromLocationId: transferFrom,
        toLocationId: transferTo,
        quantity: transferQuantity
      })
      
      alert(`調貨成功！從 ${locations.find(l => l._id === transferFrom)?.name} 調出 ${transferQuantity} 件到 ${locations.find(l => l._id === transferTo)?.name}`)
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
      alert('請選擇地點')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFiles[0])
    formData.append('locationId', selectedLocation)
    formData.append('direction', 'incoming')

    try {
      setLoading(true)
      const response = await api.post('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      alert('Excel導入成功！')
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

  // 清零功能
  async function doClearAll() {
    if (!confirm('確定要清零所有庫存嗎？')) return
    
    try {
      const response = await api.post('/import/clear-all')
      
      const resultMsg = `清零完成！
      
處理產品: ${response.data.processed || 0}
更新產品: ${response.data.updatedCount || 0}
錯誤數量: ${response.data.errors?.length || 0}

${response.data.errors?.length ? '錯誤詳情:\n' + response.data.errors.join('\n') : ''}`
      
      alert(resultMsg)
      setClearOpen(false)
      await load()
    } catch (error: any) {
      console.error('清零錯誤:', error)
      alert(`清零失敗: ${error.response?.data?.message || error.message}`)
    }
  }

  // 編輯群組
  function handleEditGroup(group: ProductGroup) {
    setEditingGroup(group)
    setGroupEditForm({
      name: group.name,
      productCode: group.products[0]?.productCode || ''
    })
  }

  // 保存群組編輯
  async function handleSaveGroupEdit(group: ProductGroup) {
    try {
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
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">產品</th>
              <th className="border border-gray-300 px-4 py-2 text-left">商品</th>
              <th className="border border-gray-300 px-4 py-2 text-left">尺寸</th>
              <th className="border border-gray-300 px-4 py-2 text-left">觀塘</th>
              <th className="border border-gray-300 px-4 py-2 text-left">灣仔</th>
              <th className="border border-gray-300 px-4 py-2 text-left">荔枝角</th>
              <th className="border border-gray-300 px-4 py-2 text-left">元朗</th>
              <th className="border border-gray-300 px-4 py-2 text-left">國內倉</th>
              <th className="border border-gray-300 px-4 py-2 text-left">總庫</th>
              <th className="border border-gray-300 px-4 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts).map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                <tr className="bg-gray-50">
                  <td colSpan={10} className="border border-gray-300 px-4 py-2 font-bold">
                    {group.name} ({group.products.length} 個產品)
                    <button
                      onClick={() => handleEditGroup(group)}
                      className="ml-4 bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                    >
                      編輯群組
                    </button>
                  </td>
                </tr>
                {sortProductsBySize([...group.products]).map((product, productIndex) => (
                  <tr key={product._id} className={productIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-4 py-2">{product.productCode}</td>
                    <td className="border border-gray-300 px-4 py-2">{product.name}</td>
                    <td className="border border-gray-300 px-4 py-2">{getProductSize(product)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {getQuantity(product, locations.find(l => l.name === '觀塘')?._id || '')}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {getQuantity(product, locations.find(l => l.name === '灣仔')?._id || '')}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {getQuantity(product, locations.find(l => l.name === '荔枝角')?._id || '')}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {getQuantity(product, locations.find(l => l.name === '元朗')?._id || '')}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {getQuantity(product, locations.find(l => l.name === '國內倉')?._id || '')}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center font-bold">
                      {getTotalQuantity(product)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
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

      {/* 導入對話框 */}
      {importOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">導入庫存</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">選擇文件</label>
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={(e) => setSelectedFiles(e.target.files)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">選擇地點</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">請選擇地點</option>
                {locations.map(location => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => doImport('incoming')}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                進貨
              </button>
              <button
                onClick={() => doImport('outgoing')}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                出貨
              </button>
              <button
                onClick={() => setImportOpen(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 調貨對話框 */}
      {transferOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">調貨</h3>
            {selectedProduct && (
              <div className="mb-4">
                <p className="text-sm text-gray-600">產品: {selectedProduct.productCode} - {selectedProduct.name}</p>
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">從</label>
              <select
                value={transferFrom}
                onChange={(e) => setTransferFrom(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">請選擇來源地點</option>
                {locations.map(location => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">到</label>
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">請選擇目標地點</option>
                {locations.map(location => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">數量</label>
              <input
                type="number"
                min="1"
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={doTransfer}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                確認調貨
              </button>
              <button
                onClick={() => setTransferOpen(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel導入對話框 */}
      {excelImportOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">Excel導入</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">選擇Excel文件</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSelectedFiles(e.target.files)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">選擇地點</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">請選擇地點</option>
                {locations.map(location => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={doExcelImport}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              >
                導入
              </button>
              <button
                onClick={() => setExcelImportOpen(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清零對話框 */}
      {clearOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">清零庫存</h3>
            <p className="text-red-600 mb-4">確定要清零所有庫存嗎？此操作不可逆轉！</p>
            <div className="flex gap-2">
              <button
                onClick={doClearAll}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                確認清零
              </button>
              <button
                onClick={() => setClearOpen(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯群組對話框 */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-bold mb-4">編輯群組</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">群組名稱</label>
              <input
                type="text"
                value={groupEditForm.name}
                onChange={(e) => setGroupEditForm({...groupEditForm, name: e.target.value})}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">產品代碼</label>
              <input
                type="text"
                value={groupEditForm.productCode}
                onChange={(e) => setGroupEditForm({...groupEditForm, productCode: e.target.value})}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveGroupEdit(editingGroup)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                保存
              </button>
              <button
                onClick={() => setEditingGroup(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}