import { useEffect, useState } from 'react'
import api from '../api'

type ProductType = { _id: string; name: string; description?: string }
type DraftProduct = {
  name: string
  productCode: string
  productType: string
  size: string  // 改為單個尺寸
  points?: number
  imageUrl?: string
}

export default function AddProduct() {
  const [productTypes, setProductTypes] = useState<ProductType[]>([])

  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    productCode: '',
    productType: '',
    sizes: '',  // 改為字符串輸入
    points: ''  // 積分
  })
  const [queue, setQueue] = useState<DraftProduct[]>([])

  // 產品類型管理狀態
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [newTypes, setNewTypes] = useState('')
  const [addingTypes, setAddingTypes] = useState(false)
  const [deletingType, setDeletingType] = useState<string | null>(null)

  useEffect(() => {
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

  function onChange(e: any) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function onUpload(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('image', file)
    setUploading(true)
    try {
      const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImageUrl(data.url)
    } finally {
      setUploading(false)
    }
  }

  function addToQueue() {
    if (!form.name || !form.productCode || !form.productType || !form.sizes.trim()) {
      alert('請完整填寫所有欄位')
      return
    }

    // 解析尺寸字符串，支持逗號分隔
    const sizesArray = form.sizes
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (sizesArray.length === 0) {
      alert('請輸入至少一個尺寸')
      return
    }

    // 為每個尺寸創建一個商品
    const newProducts: DraftProduct[] = sizesArray.map(size => ({
      name: form.name,
      productCode: form.productCode,
      productType: form.productType,
      size: size,
      points: form.points ? parseInt(form.points) || 0 : 0,
      imageUrl: imageUrl
    }))

    setQueue(prev => [...prev, ...newProducts])
    
    // 重置表單
    setForm({ name: '', productCode: '', productType: '', sizes: '', points: '' })
    setImageUrl(undefined)
  }

  function removeFromQueue(idx: number) {
    setQueue(prev => prev.filter((_, i) => i !== idx))
  }

  async function submitAll() {
    if (queue.length === 0) { alert('清單為空'); return }
    
    for (const p of queue) {
      // 將單個尺寸轉換為數組格式，不指定門市地點
      await api.post('/products', { 
        ...p, 
        sizes: [p.size],  // 轉換為數組格式
        points: p.points || 0,  // 積分
        locationIds: []   // 不指定門市地點
      })
    }
    alert(`已添加 ${queue.length} 項產品`)
    setQueue([])
  }

  // 處理產品類型批量添加
  const handleAddTypes = async () => {
    if (!newTypes.trim()) {
      alert('請輸入產品類型')
      return
    }

    const typesArray = newTypes
      .split(/[,，\n]/)
      .map(t => t.trim())
      .filter(t => t.length > 0)

    if (typesArray.length === 0) {
      alert('請輸入有效的產品類型')
      return
    }

    setAddingTypes(true)
    try {
      const response = await api.post('/product-types/batch', { types: typesArray })
      alert(response.data.message)
      setNewTypes('')
      setShowTypeModal(false)
      await loadProductTypes() // 重新載入產品類型列表
    } catch (error: any) {
      alert(error.response?.data?.message || '添加產品類型失敗')
    } finally {
      setAddingTypes(false)
    }
  }

  // 處理產品類型刪除
  const handleDeleteType = async (typeId: string, typeName: string) => {
    if (!confirm(`確定要刪除產品類型 "${typeName}" 嗎？`)) {
      return
    }

    setDeletingType(typeId)
    try {
      await api.delete(`/product-types/${typeId}`)
      alert('產品類型已刪除')
      await loadProductTypes() // 重新載入產品類型列表
      
      // 如果當前選中的產品類型被刪除，清空選擇
      if (form.productType === typeName) {
        setForm(prev => ({ ...prev, productType: '' }))
      }
    } catch (error: any) {
      alert(error.response?.data?.message || '刪除產品類型失敗')
    } finally {
      setDeletingType(null)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 980, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>添加產品</h2>
        <button 
          className="btn secondary" 
          onClick={() => setShowTypeModal(true)}
          style={{ whiteSpace: 'nowrap' }}
        >
          添加產品類型
        </button>
      </div>

      <div className="card" style={{ border: '1px dashed #e5e7eb' }}>
        <form onSubmit={e => { e.preventDefault(); addToQueue() }} style={{ display: 'grid', gap: 12 }}>
          <div className="grid-2">
            <label className="label">
              名稱
              <input className="input" name="name" value={form.name} onChange={onChange} required />
            </label>
            <label className="label">
              產品編號
              <input className="input" name="productCode" value={form.productCode} onChange={onChange} required />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="label">
                產品類型
                <div style={{ position: 'relative' }}>
                  <select className="select" name="productType" value={form.productType} onChange={onChange} required>
                    <option value="">選擇產品類型</option>
                    {productTypes.map(type => (
                      <option key={type._id} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                  {/* 刪除按鈕 - 只在有選中產品類型時顯示 */}
                  {form.productType && (
                    <button
                      type="button"
                      onClick={() => {
                        const selectedType = productTypes.find(t => t.name === form.productType)
                        if (selectedType) {
                          handleDeleteType(selectedType._id, selectedType.name)
                        }
                      }}
                      disabled={deletingType === productTypes.find(t => t.name === form.productType)?._id}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                      title={`刪除產品類型 "${form.productType}"`}
                    >
                      {deletingType === productTypes.find(t => t.name === form.productType)?._id ? '...' : ''}
                    </button>
                  )}
                </div>
              </label>
              <label className="label">
                積分
                <input 
                  className="input" 
                  type="number" 
                  name="points" 
                  value={form.points} 
                  onChange={onChange} 
                  placeholder="0"
                  min="0"
                />
              </label>
            </div>
            <label className="label">
              圖片
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  導入圖片
                  <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
                </label>
                {uploading && <div style={{ color: '#6b7280', fontSize: 12 }}>上傳中</div>}
              </div>
              {imageUrl && (
                <div style={{ marginTop: 8 }}>
                  <img src={imageUrl} alt="預覽" style={{ height: 80, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </div>
              )}
            </label>
          </div>

          <div className="label">
            尺寸（用逗號分隔多個尺寸）
            <input 
              className="input" 
              name="sizes"
              value={form.sizes} 
              onChange={onChange} 
              placeholder="例如：S, M, L, XL 或 36, 38, 40, 42" 
              required
            />
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              提示：輸入多個尺寸時請用逗號分隔，每個尺寸將創建為獨立的商品
            </div>
          </div>

          <div className="actions">
            <button className="btn" type="submit" disabled={uploading}>加入清單</button>
            <button type="button" className="btn secondary" onClick={() => { setForm({ name: '', productCode: '', productType: '', sizes: '', points: '' }); setImageUrl(undefined) }}>重置當前</button>
          </div>
        </form>
      </div>

      <div>
        <table className="table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>產品編號</th>
              <th>類型</th>
              <th>尺寸</th>
              <th>圖片</th>
              <th className="right"></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((p, idx) => (
              <tr key={idx}>
                <td>{p.name}</td>
                <td>{p.productCode}</td>
                <td>{p.productType}</td>
                <td>{p.size}</td>
                <td>{p.imageUrl ? <img src={p.imageUrl} alt="" style={{ height: 40, borderRadius: 6 }} /> : '-'}</td>
                <td className="right"><button className="btn secondary" onClick={() => removeFromQueue(idx)}>移除</button></td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr><td colSpan={6} style={{ color: '#6b7280' }}>清單為空，請先添加產品</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={submitAll} disabled={queue.length === 0 || uploading}>添加產品</button>
      </div>

      {/* 產品類型添加模態框 */}
      {showTypeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ maxWidth: 500, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>批量添加產品類型</h3>
            <p style={{ color: '#6b7280', marginBottom: 16 }}>
              請輸入產品類型，多個類型可以用逗號、換行或中文逗號分隔
            </p>
            <div className="label">
              產品類型
              <textarea
                className="input"
                value={newTypes}
                onChange={e => setNewTypes(e.target.value)}
                placeholder="例如：保暖衣, 泳衣, 運動服&#10;或者：&#10;保暖衣&#10;泳衣&#10;運動服"
                rows={6}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="actions" style={{ marginTop: 16 }}>
              <button 
                className="btn" 
                onClick={handleAddTypes}
                disabled={addingTypes || !newTypes.trim()}
              >
                {addingTypes ? '添加中...' : '添加產品類型'}
              </button>
              <button 
                className="btn secondary" 
                onClick={() => {
                  setShowTypeModal(false)
                  setNewTypes('')
                }}
                disabled={addingTypes}
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
