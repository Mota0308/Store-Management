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
  locationId: string | { _id: string; name: string } | null // 添加 null 支持
  quantity: number
}

interface Product {
  _id: string
  name: string
  productCode: string
  productType: string
  sizes?: string[] | string
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
  const [sizeSearchTerm, setSizeSearchTerm] = useState('')
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
  
  // 清零狀態
  const [clearOpen, setClearOpen] = useState(false)
  
  // 進度條狀態
  const [progressState, setProgressState] = useState<{
    isVisible: boolean
    progress: number
    message: string
    type: 'excel' | 'clear' | null
  }>({
    isVisible: false,
    progress: 0,
    message: '',
    type: null
  })
  // 增加分組狀態
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null)
  const [addGroupForm, setAddGroupForm] = useState<{
    size: string
  }>({
    size: ''
  })
  // 修改分類狀態
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<ProductGroup | null>(null)
  const [newCategory, setNewCategory] = useState<string>('')
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
      // 按照指定順序排序：觀塘，灣仔，荔枝角，元朗，元朗觀塘倉，元朗灣仔倉，元朗荔枝角倉，屯門，國内倉
      const order = ['觀塘', '灣仔', '荔枝角', '元朗', '元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉', '屯門', '國内倉'];
      const sortedLocations = r.data.sort((a: Location, b: Location) => {
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        // 如果門市不在預定義順序中，放到最後
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
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
    try {
      const response = await api.get('/products')
      console.log('API響應:', response.data)
      // 修復：後端直接返回產品數組
      const productsData = response.data || []
      console.log('載入的產品數量:', productsData.length)
      setProducts(productsData)
    } catch (error) {
      console.error('載入產品失敗:', error)
      alert('載入產品失敗，請檢查網絡連接')
    }
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
        p.productCode.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Filter by size search term
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
  }, [products, selectedType, searchTerm, sizeSearchTerm, sortBy, sortOrder])

  function getProductSize(product: Product): string {
    // 处理各种格式的尺寸数据
    if (product.sizes) {
      if (Array.isArray(product.sizes) && product.sizes.length > 0) {
        return product.sizes.join(', ')
      } else if (typeof product.sizes === 'string' && product.sizes.trim()) {
        return product.sizes
      }
    }
    return product.size || ''
  }

  // 新增：按尺寸大小排序的函數
  function sortProductsBySize(products: Product[]): Product[] {
    return products.sort((a, b) => {
      const aSize = getProductSize(a)
      const bSize = getProductSize(b)
      
      // 提取數字進行比較
      const aNumbers = aSize.match(/\d+/g) || []
      const bNumbers = bSize.match(/\d+/g) || []
      
      // 如果都有數字，按第一個數字比較
      if (aNumbers.length > 0 && bNumbers.length > 0) {
        const aNum = parseInt(aNumbers[0] || '0')
        const bNum = parseInt(bNumbers[0] || '0')
        return aNum - bNum
      }
      
      // 如果只有一個有數字，有數字的排在前面
      if (aNumbers.length > 0 && bNumbers.length === 0) return -1
      if (aNumbers.length === 0 && bNumbers.length > 0) return 1
      
      // 都沒有數字，按字符串比較
      return aSize.localeCompare(bSize)
    })
  }

  // 修復版本：添加完整的 null 檢查
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
      
      // 處理原始的 ObjectId 字符串，添加 null 檢查
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
    return sortOrder === 'asc' ? '↓' : '↑'
  }

  // 新增：導出Excel功能
  function exportToExcel() {
    try {
      // 準備數據
      const exportData = []
      
      // 添加表頭
      const headers = ['編號', '產品', '尺寸', '觀塘', '灣仔', '荔枝角', '元朗', '元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉', '屯門', '國内倉']
      exportData.push(headers)
      
      // 添加產品數據
      Object.values(groupedProducts).forEach(group => {
        // 對每個組內的產品按尺寸排序
        const sortedProducts = sortProductsBySize([...group.products])
        
        sortedProducts.forEach(product => {
          const row = [
            product.productCode,
            product.name,
            getProductSize(product),
            getQuantity(product, locations.find(l => l.name === '觀塘')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '灣仔')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '荔枝角')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '元朗')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '元朗觀塘倉')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '元朗灣仔倉')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '元朗荔枝角倉')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '屯門')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '國内倉')?._id || '')
          ]
          exportData.push(row)
        })
      })
      
      // 創建工作簿
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
      alert('導出Excel失敗，請重試')
    }
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

  // 進度條控制函數
  function showProgress(type: 'excel' | 'clear', message: string) {
    setProgressState({
      isVisible: true,
      progress: 0,
      message,
      type
    })
  }
  
  function updateProgress(progress: number, message?: string) {
    setProgressState(prev => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress)),
      message: message || prev.message
    }))
  }
  
  function hideProgress() {
    setProgressState({
      isVisible: false,
      progress: 0,
      message: '',
      type: null
    })
  }
  
  // 模擬進度更新函數
  function simulateProgress(duration: number = 5000, messages?: string[]) {
    return new Promise<void>((resolve) => {
      let currentProgress = 0
      const steps = 20
      const stepDuration = duration / steps
      const messageInterval = Math.floor(steps / (messages?.length || 4))
      let messageIndex = 0
      
      const interval = setInterval(() => {
        currentProgress += 5
        
        // 更新進度消息
        if (messages && currentProgress % (messageInterval * 5) === 0 && messageIndex < messages.length) {
          updateProgress(currentProgress, messages[messageIndex])
          messageIndex++
        } else {
          updateProgress(currentProgress)
        }
        
        if (currentProgress >= 100) {
          clearInterval(interval)
          resolve()
        }
      }, stepDuration)
    })
  }

  // Excel導入功能 - 使用SSE實時進度
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
      // 顯示進度條
      showProgress('excel', '正在準備Excel文件...')
      
      const form = new FormData()
      excelImportState.files.forEach(f => form.append('files', f))

      // 使用改進的進度追蹤方式
      const response = await new Promise<any>((resolve, reject) => {
        // 啟動進度模擬
        let currentStep = 0
        const progressSteps = [
          { progress: 10, message: '正在上傳文件...' },
          { progress: 20, message: '正在解析Excel結構...' },
          { progress: 30, message: '正在驗證產品資料...' },
          { progress: 50, message: '正在批次處理資料...' },
          { progress: 70, message: '正在更新庫存資料...' },
          { progress: 85, message: '正在保存變更...' },
          { progress: 95, message: '正在完成最後步驟...' }
        ]
        
        const progressInterval = setInterval(() => {
          if (currentStep < progressSteps.length) {
            const step = progressSteps[currentStep]
            updateProgress(step.progress, step.message)
            currentStep++
          }
        }, 1500) // 每1.5秒更新一次
        
        // 使用原始API端點但增加進度追蹤
        api.post('/import/excel', form, {
          timeout: 900000, // 15分鐘超時
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }).then(response => {
          clearInterval(progressInterval)
          updateProgress(100, '處理完成，正在載入結果...')
          resolve(response)
        }).catch(error => {
          clearInterval(progressInterval)
          reject(error)
        })
      })
      
      // 短暫延遲以顯示完成狀態
      await new Promise(resolve => setTimeout(resolve, 500))
      
      hideProgress()

      // 顯示結果
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
      hideProgress()
      console.error('Excel導入錯誤:', error)
    
      let errorMsg = 'Excel導入失敗：'
      if (error.message.includes('timeout') || error.code === 'ECONNABORTED') {
        errorMsg += '處理超時，請嘗試使用較小的文件或檢查網絡連接'
      } else if (error.message.includes('413')) {
        errorMsg += '文件太大，請使用較小的文件'
      } else {
        errorMsg += error.message || '未知錯誤'
      }
      
      alert(errorMsg)
    }
  }

  // 清零所有商品數量 - 使用SSE實時進度
  async function doClearAll() {
    if (!confirm('確定要清零所有商品的數量嗎？此操作不可撤銷！')) {
      return
    }

    try {
      // 顯示進度條
      showProgress('clear', '正在準備清零操作...')
      
      // 使用改進的進度追蹤方式
      const response = await new Promise<any>((resolve, reject) => {
        // 啟動進度模擬
        let currentStep = 0
        const progressSteps = [
          { progress: 10, message: '正在連接服務器...' },
          { progress: 25, message: '正在獲取產品列表...' },
          { progress: 40, message: '正在批次清零庫存...' },
          { progress: 60, message: '正在更新資料庫...' },
          { progress: 80, message: '正在保存變更...' },
          { progress: 95, message: '正在完成操作...' }
        ]
        
        const progressInterval = setInterval(() => {
          if (currentStep < progressSteps.length) {
            const step = progressSteps[currentStep]
            updateProgress(step.progress, step.message)
            currentStep++
          }
        }, 1000) // 每1秒更新一次
        
        // 使用原始API端點
        api.post('/import/clear').then(response => {
          clearInterval(progressInterval)
          updateProgress(100, '清零完成，正在載入結果...')
          resolve(response)
        }).catch(error => {
          clearInterval(progressInterval)
          reject(error)
        })
      })
      
      // 短暫延遲以顯示完成狀態
      await new Promise(resolve => setTimeout(resolve, 500))
      
      hideProgress()
      
      const resultMsg = `清零完成！
    
處理產品: ${response.data.processed}
更新產品: ${response.data.updated}
錯誤數量: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '錯誤詳情:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '無錯誤'}`
    
      alert(resultMsg)
      setClearOpen(false)
      await load()
      
    } catch (error: any) {
      hideProgress()
      console.error('清零錯誤:', error)
    
      let errorMsg = '清零失敗：'
      if (error.message) {
        errorMsg += error.message
      } else {
        errorMsg += '未知錯誤'
      }
      
      alert(errorMsg)
    }
  }

// 編輯和刪除處理函數 - 修復版本
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
      // 修复：将尺寸字符串转换为数组格式
      const sizesArray = editForm.size ? editForm.size.split(',').map(s => s.trim()).filter(s => s) : [];
      const updateData = {
        ...editForm,
        sizes: sizesArray, // 发送数组格式的尺寸
        size: undefined // 移除單數字段
      };
      
      console.log('發送更新數據:', updateData);
      
      const response = await api.put(`/products/${productId}`, updateData)
      alert('商品更新成功')
      setEditingProduct(null)
      await load()
    } catch (error: any) {
      console.error('更新錯誤:', error);
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

// 新增：刪除整個商品組的函數
async function handleDeleteGroup(group: ProductGroup) {
  if (confirm(`確定要刪除整個商品組 "${group.name}" (${group.productCode}) 嗎？\n這將刪除該商品的所有尺寸變體，此操作不可撤銷！`)) {
    try {
      // 批量刪除該組的所有商品
      const deletePromises = group.products.map(product => 
        api.delete(`/products/${product._id}`)
      )
      
      await Promise.all(deletePromises)
      alert(`商品組 "${group.name}" 刪除成功，共刪除 ${group.products.length} 個商品`)
      await load()
    } catch (error: any) {
      alert(`刪除失敗：${error.response?.data?.message || error.message}`)
    }
  }
}

  // 新增：增加分組的函數
  const handleAddGroup = (group: ProductGroup) => {
    setSelectedGroup(group)
    setAddGroupForm({
      size: ''
    })
    setAddGroupOpen(true)
  }

  // 新增：提交增加分組的函數
  const doAddGroup = async () => {
    try {
      if (!addGroupForm.size || !selectedGroup) {
        alert('請填寫尺寸')
        return
      }

      // 檢查尺寸是否已存在
      const existingSizes = selectedGroup.products.map(p => 
        Array.isArray(p.sizes) ? p.sizes : [p.size || p.sizes]
      ).flat().filter(Boolean)
      
      if (existingSizes.includes(addGroupForm.size)) {
        alert('該尺寸已存在於此商品組中')
        return
      }

      // 創建新產品（同一商品組的新尺寸變體）
      const locationIds = locations.map(location => location._id)
      const baseProduct = selectedGroup.products[0] // 使用組內第一個產品作為模板
      
      const productData = {
        name: baseProduct.name,
        productCode: baseProduct.productCode,
        productType: baseProduct.productType,
        sizes: [addGroupForm.size], // 新尺寸
        price: baseProduct.price,
        locationIds: locationIds
      }

      console.log('創建新尺寸變體:', productData)
      await api.post('/products', productData)
      
      // 重新載入數據
      load()
      setAddGroupOpen(false)
      setSelectedGroup(null)
      alert('新尺寸添加成功！')
    } catch (error: any) {
      console.error('添加尺寸失敗:', error)
      alert(`添加失敗：${error.response?.data?.message || error.message}`)
    }
  }

  // 新增：處理分類修改的函數
  const handleCategoryChange = (group: ProductGroup) => {
    setSelectedCategoryGroup(group)
    // 獲取當前產品類型
    const currentType = group.products[0]?.productType || ''
    setNewCategory(currentType)
    setCategoryOpen(true)
  }

  // 新增：提交分類修改的函數
  const doCategoryChange = async () => {
    try {
      if (!selectedCategoryGroup || !newCategory) {
        alert('請選擇產品類型')
        return
      }

      // 批量更新該組所有產品的產品類型
      const updatePromises = selectedCategoryGroup.products.map(product => 
        api.put(`/products/${product._id}`, {
          ...product,
          productType: newCategory
        })
      )

      await Promise.all(updatePromises)
      
      // 重新載入數據
      load()
      setCategoryOpen(false)
      setSelectedCategoryGroup(null)
      alert(`產品類型已更新為"${newCategory}"`)
    } catch (error: any) {
      console.error('更新產品類型失敗:', error)
      alert(`更新失敗：${error.response?.data?.message || error.message}`)
    }
  }

// Group products by name and productCode，並按尺寸排序
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

// 對每個組內的產品按尺寸排序
Object.values(groupedProducts).forEach(group => {
  group.products = sortProductsBySize(group.products)
})

console.log('filteredProducts數量:', filteredProducts.length)
console.log('groupedProducts數量:', Object.keys(groupedProducts).length)

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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
          {Object.values(groupedProducts).map((group: ProductGroup, groupIndex) => (
              <React.Fragment key={group.key}>
              <tr className="group-header" style={{ borderBottom: '2px solid #dc2626' }}>
                <td colSpan={locations.length + 2} style={{ cursor: 'pointer' }} onClick={() => toggleGroup(group.key)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{expandedGroups.has(group.key) ? '▼' : '▶'} {group.name} ({group.productCode})</span>
                    <button 
                      className="btn secondary" 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCategoryChange(group)
                      }}
                      style={{ 
                        backgroundColor: '#6b7280', 
                        color: 'white', 
                        border: 'none',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      分類
                    </button>
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
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
                      fontSize: '12px',
                      marginRight: '4px'
                    }}
                  >
                    刪除
                  </button>
                                     <button 
                     className="btn primary" 
                     onClick={(e) => {
                       e.stopPropagation()
                       handleAddGroup(group)
                     }}
                     style={{ 
                       backgroundColor: '#2563eb', 
                       color: 'white', 
                       border: 'none',
                       padding: '4px 8px',
                       borderRadius: '4px',
                       cursor: 'pointer',
                       fontSize: '12px'
                     }}
                   >
                     增加分組
                   </button>
                  </td>
                </tr>
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
                      // 顯示模式
                      <>
                        <td>{product.name}</td>
                        <td>{product.productCode}</td>
                        <td>{getProductSize(product)}</td>
                      {locations.map(location => {
                        const quantity = getQuantity(product, location._id)
                        return (
                          <td key={location._id} className={quantity === 0 ? 'highlight-cell' : ''}>
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
                  <li><strong>必須包含列：</strong>商品編號、商品名稱、尺寸、各門市庫存列</li>
                  <li><strong>商品編號：</strong>支持變體（編號、產品編號、貨號、SKU、產品代碼、型號等）</li>
                  <li><strong>商品名稱：</strong>支持變體（產品、商品詳情、商品名稱、產品名稱、名稱、商品等）</li>
                  <li><strong>尺寸：</strong>支持變體（尺寸、規格、選項、尺碼、商品選項等）</li>
                  <li><strong>門市庫存：</strong>觀塘、灣仔、荔枝角、元朗、元朗觀塘倉、元朗灣仔倉、元朗荔枝角倉、屯門、國內倉（支持多列相同名稱自動累加）</li>
                  <li><strong>更新方式：</strong>直接替換現有庫存數量，不是累加</li>
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

      {/* 進度條彈窗 */}
      {progressState.isVisible && (
        <div className="modal-backdrop">
          <div className="modal progress-modal">
            <div className="header">
              {progressState.type === 'excel' ? 'Excel導入進度' : '清零操作進度'}
            </div>
            <div className="body">
              <div className="progress-container">
                <div className="progress-message">{progressState.message}</div>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${progressState.progress}%` }}
                  ></div>
                </div>
                <div className="progress-percentage">{Math.round(progressState.progress)}%</div>
              </div>
              <div className="progress-warning">
                <p><strong>請勿關閉此頁面</strong></p>
                <p>操作正在進行中，請耐心等待...</p>
              </div>
            </div>
          </div>
        </div>
      )}

    {/* 清零確認對話框 */}
      {clearOpen && (
        <div className="modal-backdrop">
          <div className="modal">
          <div className="header">清零所有商品數量</div>
            <div className="body">
            <p>?? 警告：此操作將把所有商品的庫存數量設為0，此操作不可撤銷！</p>
            <p>確定要繼續嗎？</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setClearOpen(false)}>取消</button>
            <button className="btn danger" onClick={doClearAll}>確認清零</button>
            </div>
          </div>
        </div>
      )}

      {/* 增加分組對話框 */}
      {addGroupOpen && selectedGroup && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">為 "{selectedGroup.name}" 增加新尺寸</div>
            <div className="body">
              <div className="form-group">
                <label>商品信息</label>
                <div style={{ padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', marginBottom: '12px' }}>
                  <p><strong>產品名稱：</strong>{selectedGroup.name}</p>
                  <p><strong>產品編號：</strong>{selectedGroup.productCode}</p>
                  <p><strong>現有尺寸：</strong>
                    {selectedGroup.products.map(p => 
                      Array.isArray(p.sizes) ? p.sizes.join(', ') : (p.size || p.sizes || '')
                    ).filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
              <div className="form-group">
                <label>新尺寸</label>
                <input
                  type="text"
                  value={addGroupForm.size}
                  onChange={e => setAddGroupForm(prev => ({ ...prev, size: e.target.value }))}
                  placeholder="輸入新尺寸（例如：XL, XXL, 14, 16等）"
                  autoFocus
                />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => { setAddGroupOpen(false); setSelectedGroup(null); }}>取消</button>
              <button className="btn primary" onClick={doAddGroup}>添加尺寸</button>
            </div>
          </div>
                  </div>
        )}

      {/* 修改分類對話框 */}
      {categoryOpen && selectedCategoryGroup && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">修改 "{selectedCategoryGroup.name}" 的產品類型</div>
            <div className="body">
              <div className="form-group">
                <label>商品信息</label>
                <div style={{ padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', marginBottom: '12px' }}>
                  <p><strong>產品名稱：</strong>{selectedCategoryGroup.name}</p>
                  <p><strong>產品編號：</strong>{selectedCategoryGroup.productCode}</p>
                  <p><strong>當前類型：</strong>{selectedCategoryGroup.products[0]?.productType || '未設定'}</p>
                  <p><strong>影響產品數：</strong>{selectedCategoryGroup.products.length} 個尺寸變體</p>
                </div>
              </div>
              <div className="form-group">
                <label>選擇新的產品類型</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">請選擇產品類型</option>
                  {productTypes.map(type => (
                    <option key={type._id} value={type.name}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => { setCategoryOpen(false); setSelectedCategoryGroup(null); }}>取消</button>
              <button className="btn primary" onClick={doCategoryChange}>更新分類</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}