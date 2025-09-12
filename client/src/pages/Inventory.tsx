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

interface Product {
  _id: string
  name: string
  productCode: string
  productType: ProductType
  sizes: string[]
  inventories: {
    locationId: Location
    quantity: number
  }[]
}

interface ExcelImportState {
  files: File[]
  locationId: string
  processing: boolean
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ [key: string]: number }>({})
  const [excelImportState, setExcelImportState] = useState<ExcelImportState>({
    files: [],
    locationId: '',
    processing: false
  })
  const [clearOpen, setClearOpen] = useState(false)

  // 載入數據
  async function load() {
    try {
      setLoading(true)
      const [productsRes, locationsRes, productTypesRes] = await Promise.all([
        api.get('/products'),
        api.get('/locations'),
        api.get('/product-types')
      ])
      setProducts(productsRes.data)
      setLocations(locationsRes.data)
      setProductTypes(productTypesRes.data)
    } catch (error) {
      console.error('載入數據失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 排序函數 - 按尺寸數字排序
  function sortProductsBySize(products: Product[]): Product[] {
    return products.map(product => ({
      ...product,
      sizes: product.sizes.sort((a, b) => {
        // 提取尺寸中的數字進行比較
        const getSizeNumber = (size: string) => {
          const match = size.match(/\d+/)
          return match ? parseInt(match[0], 10) : 0
        }
        return getSizeNumber(a) - getSizeNumber(b)
      })
    }))
  }

  // 導出Excel功能
  function exportToExcel() {
    const exportData = [
      ['產品名稱', '產品編號', '產品類型', '尺寸', '門市', '數量']
    ]

    products.forEach(product => {
      product.inventories.forEach(inv => {
        product.sizes.forEach(size => {
          exportData.push([
            product.name,
            product.productCode,
            product.productType.name,
            size,
            inv.locationId.name,
            inv.quantity.toString()
          ])
        })
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '庫存報告')
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `庫存報告_${timestamp}.xlsx`
    
    XLSX.writeFile(wb, filename)
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

  // 保存編輯
  async function handleSaveEdit(productId: string) {
    try {
      const response = await api.put(`/products/${productId}`, editForm)
      alert('產品更新成功！')
      setEditingProduct(null)
      await load()
    } catch (error: any) {
      alert(`更新失敗: ${error.response?.data?.message || error.message}`)
    }
  }

  // 刪除產品
  async function handleDelete(product: Product) {
    if (confirm(`確定要刪除產品 "${product.name}" 嗎？`)) {
      try {
        await api.delete(`/products/${product._id}`)
        alert('產品刪除成功！')
        await load()
      } catch (error: any) {
        alert(`刪除失敗: ${error.response?.data?.message || error.message}`)
      }
    }
  }

  // Excel導入處理
  async function handleExcelImport() {
    if (!excelImportState.locationId || excelImportState.files.length === 0) {
      alert('請選擇門市和Excel文件')
      return
    }

    setExcelImportState(prev => ({ ...prev, processing: true }))
    
    try {
      const formData = new FormData()
      formData.append('locationId', excelImportState.locationId)
      excelImportState.files.forEach(file => {
        formData.append('files', file)
      })

      const response = await api.post('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      alert(`Excel導入完成！處理了 ${response.data.summary?.processed || 0} 個產品`)
      await load()
    } catch (error: any) {
      alert(`Excel導入失敗: ${error.response?.data?.message || error.message}`)
    } finally {
      setExcelImportState({ files: [], locationId: '', processing: false })
    }
  }

  if (loading) return <div className="loading">載入中...</div>

  const sortedProducts = sortProductsBySize(products)

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1>庫存管理</h1>
        <div className="header-actions">
          <button className="btn" onClick={exportToExcel}>導出Excel</button>
          <button className="btn" onClick={() => setClearOpen(true)}>清零</button>
        </div>
      </div>

      {/* Excel導入區域 */}
      <div className="import-section">
        <h3>Excel導入</h3>
        <div className="import-controls">
          <select 
            value={excelImportState.locationId} 
            onChange={e => setExcelImportState(s => ({ ...s, locationId: e.target.value }))}
          >
            <option value="">選擇門市</option>
            {locations.map(loc => (
              <option key={loc._id} value={loc._id}>{loc.name}</option>
            ))}
          </select>
          <input 
            multiple 
            type="file" 
            accept=".xlsx,.xls" 
            onChange={e => setExcelImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} 
          />
          <button 
            className="btn" 
            onClick={handleExcelImport}
            disabled={excelImportState.processing}
          >
            {excelImportState.processing ? '處理中...' : '導入Excel'}
          </button>
        </div>
      </div>

      {/* 產品列表 */}
      <div className="products-container">
        {sortedProducts.map(product => (
          <div key={product._id} className="product-group">
            <div className="product-header">
              <h3>{product.name} ({product.productCode})</h3>
              <div className="product-actions">
                <button 
                  className="btn small" 
                  onClick={() => setEditingProduct(product._id)}
                >
                  編輯
                </button>
                <button 
                  className="btn small danger" 
                  onClick={() => handleDelete(product)}
                >
                  刪除
                </button>
              </div>
            </div>
            
            <div className="sizes-container">
              {product.sizes.map((size, index) => (
                <div key={index} className="size-group">
                  <h4>{size}</h4>
                  <div className="inventories-grid">
                    {product.inventories.map(inv => (
                      <div key={inv.locationId._id} className="inventory-item">
                        <span className="location-name">{inv.locationId.name}</span>
                        {editingProduct === product._id ? (
                          <input
                            type="number"
                            value={editForm[`${product._id}-${size}-${inv.locationId._id}`] ?? inv.quantity}
                            onChange={e => setEditForm(prev => ({
                              ...prev,
                              [`${product._id}-${size}-${inv.locationId._id}`]: parseInt(e.target.value) || 0
                            }))}
                            className="quantity-input"
                          />
                        ) : (
                          <span className="quantity">{inv.quantity}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {editingProduct === product._id && (
              <div className="edit-actions">
                <button 
                  className="btn" 
                  onClick={() => handleSaveEdit(product._id)}
                >
                  保存
                </button>
                <button 
                  className="btn secondary" 
                  onClick={() => {
                    setEditingProduct(null)
                    setEditForm({})
                  }}
                >
                  取消
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 清零確認對話框 */}
      {clearOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>確認清零</h3>
            <p>確定要清零所有庫存嗎？此操作無法撤銷。</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setClearOpen(false)}>取消</button>
              <button className="btn danger" onClick={doClearAll}>確定清零</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
