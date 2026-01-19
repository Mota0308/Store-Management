import { useState, useEffect } from 'react'
import api from '../api'

interface RestockItem {
  settingId: string
  productId: string
  productCode: string
  productName: string
  locationName: string
  currentQuantity: number
  threshold: number
}

export default function Restock() {
  const [neededItems, setNeededItems] = useState<RestockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadNeededItems()
  }, [])

  const loadNeededItems = async () => {
    try {
      setLoading(true)
      const response = await api.get('/restock/needed')
      setNeededItems(response.data)
    } catch (error) {
      console.error('獲取補貨列表失敗:', error)
      alert('獲取補貨列表失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSelect = (settingId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(settingId)) {
        newSet.delete(settingId)
      } else {
        newSet.add(settingId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedItems.size === neededItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(neededItems.map(item => item.settingId)))
    }
  }

  const handleMarkRestocked = async (settingId: string) => {
    try {
      await api.post(`/restock/restocked/${settingId}`)
      await loadNeededItems()
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(settingId)
        return newSet
      })
    } catch (error) {
      console.error('標記補貨失敗:', error)
      alert('標記補貨失敗')
    }
  }

  const handleBatchMarkRestocked = async () => {
    if (selectedItems.size === 0) {
      alert('請選擇要標記的項目')
      return
    }

    try {
      await api.post('/restock/restocked/batch', {
        settingIds: Array.from(selectedItems)
      })
      await loadNeededItems()
      setSelectedItems(new Set())
      alert(`已標記 ${selectedItems.size} 個項目為已補貨`)
    } catch (error) {
      console.error('批量標記補貨失敗:', error)
      alert('批量標記補貨失敗')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>載入中...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>補貨提醒</h1>
        {neededItems.length > 0 && (
          <button
            className="btn"
            onClick={handleBatchMarkRestocked}
            disabled={selectedItems.size === 0}
            style={{
              opacity: selectedItems.size === 0 ? 0.5 : 1,
              cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            批量標記已補貨 ({selectedItems.size})
          </button>
        )}
      </div>

      {neededItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '18px', color: '#6b7280', marginBottom: '8px' }}>✅</div>
          <div style={{ color: '#6b7280' }}>目前沒有需要補貨的產品</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="btn secondary"
              onClick={handleSelectAll}
              style={{ fontSize: '14px', padding: '8px 16px' }}
            >
              {selectedItems.size === neededItems.length ? '取消全選' : '全選'}
            </button>
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              共 {neededItems.length} 項需要補貨
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.size === neededItems.length && neededItems.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>產品編號</th>
                  <th>產品名稱</th>
                  <th>地點</th>
                  <th>當前庫存</th>
                  <th>補貨閾值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {neededItems.map(item => (
                  <tr key={item.settingId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.settingId)}
                        onChange={() => handleToggleSelect(item.settingId)}
                      />
                    </td>
                    <td>{item.productCode}</td>
                    <td>{item.productName}</td>
                    <td>{item.locationName}</td>
                    <td style={{ 
                      color: item.currentQuantity <= item.threshold ? '#ef4444' : '#111827',
                      fontWeight: item.currentQuantity <= item.threshold ? 'bold' : 'normal'
                    }}>
                      {item.currentQuantity}
                    </td>
                    <td>{item.threshold}</td>
                    <td>
                      <button
                        className="btn ghost"
                        onClick={() => handleMarkRestocked(item.settingId)}
                        style={{ fontSize: '14px', padding: '6px 12px' }}
                      >
                        標記已補貨
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

