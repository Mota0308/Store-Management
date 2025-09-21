import React, { useState, useEffect } from 'react'
import api from '../api'
import * as XLSX from 'xlsx'

// �w�q����
interface Location {
  _id: string
  name: string
}

interface ProductType {
  _id: string
  name: string
}

interface Inventory {
  locationId: string | { _id: string; name: string } | null // �K�[ null ����
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
  const [sizeSearchTerm, setSizeSearchTerm] = useState('') // �s�K�[�o��
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Mobile detection & controls
  const [isMobile, setIsMobile] = useState<boolean>(false)
  const [mobileControlsOpen, setMobileControlsOpen] = useState<boolean>(false)

  // �s�W�s�սs�説�A
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
  
  // �ɤJ�w�s���A
  const [importOpen, setImportOpen] = useState(false)
  const [importState, setImportState] = useState<{ locationId: string; files: File[] }>({ locationId: '', files: [] })
  
  // �ಾ�w�s���A
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferState, setTransferState] = useState<{ fromLocationId: string; toLocationId: string; files: File[] }>({ fromLocationId: '', toLocationId: '', files: [] })
  
  // Excel�ɤJ���A
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [excelImportState, setExcelImportState] = useState<{ files: File[] }>({ files: [] })

  // �M�s���A
  const [clearOpen, setClearOpen] = useState(false)
  // �s�説�A
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
      // ���өT�w���ǱƦC�G�i�f�B�W�[�B�w�s�աB�[��B�W�J�B��K���B���ԡB�ꤺ�ܡB�`�w
      const order = ['�i�f', '�W�[', '�w�s��', '�[��', '�W�J', '��K��', '����', '�ꤺ��', '�`�w'];
      const sortedLocations = r.data.sort((a: Location, b: Location) => {
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        return aIndex - bIndex;
      });
      console.log(" �Ƨǫ᪺�a�I:\, sortedLocations.map(l => l.name)); setLocations(sortedLocations);
    })
    loadProductTypes()
  }, [])

  useEffect(() => {
    load()
  }, [products, selectedType, searchTerm, sizeSearchTerm, sortBy, sortOrder]) // �K�[ sizeSearchTerm

  async function loadProductTypes() {
      const response = await api.get('/product-types')
    setProductTypes(response.data || [])
  }

  async function load() {
    const response = await api.get('/products')
    // �T�O��^���ƾڵ��c�O { products: [...], pagination: {...} }
    setProducts(response.data.products || [])
  }

  useEffect(() => {
    let filtered = products || [] // �K�[�ŭ��ˬd

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

    // Filter by size search term - ���h�k�h�]�����ǰt�^
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
  }, [products, selectedType, searchTerm, sizeSearchTerm, sortBy, sortOrder]) // �K�[ sizeSearchTerm

  function getProductSize(product: Product): string {
    if (product.sizes && product.sizes.length > 0) {
      return product.sizes.join(', ')
    }
    return product.size || ''
  }

  // �s�W���~�ؤo�Ƨ��޿�
  function sortProductsBySize(products: Product[]): Product[] {
    return products.sort((a, b) => {
      const aSize = getProductSize(a)
      const bSize = getProductSize(b)
      
      // �����Ʀr�i��Ƨ�
      const aNumbers = aSize.match(/\d+/g) || []
      const bNumbers = bSize.match(/\d+/g) || []
      
      // �p�G���Ʀr�A����Ĥ@�ӼƦr
      if (aNumbers.length > 0 && bNumbers.length > 0) {
        const aNum = parseInt(aNumbers[0] || '0')
        const bNum = parseInt(bNumbers[0] || '0')
        return aNum - bNum
      }
      
      // �p�G�u���@�Ӧ��Ʀr�A�Ʀr�b�e
      if (aNumbers.length > 0 && bNumbers.length === 0) return -1
      if (aNumbers.length === 0 && bNumbers.length > 0) return 1
      
      // ���S�Ʀr�A���r���Ƨ�
      return aSize.localeCompare(bSize)
    })
  }

  // �T�O�K�[ null �ˬd
  function getQuantity(product: Product, locationId: string): number {
    if (!product.inventories || !Array.isArray(product.inventories)) {
      return 0
    }
    const inventory = product.inventories.find(inv => {
      // �ˬd locationId �O�_�� null �� undefined
      if (!inv.locationId) {
        return false
      }
      
      // �B�z populate �᪺ locationId ��H
      if (typeof inv.locationId === 'object' && inv.locationId !== null) {
        return inv.locationId._id === locationId || inv.locationId._id.toString() === locationId
      }
      
      // �B�z�r�Ŧ� ObjectId �����p�A�K�[ null �ˬd
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
    return sortOrder === 'asc' ? '��' : '��'
  }

  // �s�W�s�սs��\��
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

  // �s�W�s�սs��O�s - ��q��s�Ҧ����~
  async function handleSaveGroupEdit(group: ProductGroup) {
    try {
      // ��q��s�Ӹs�դ��Ҧ����~���W�٩M���~�N�X
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
      alert(`���~�� "${group.name}" ��s���\�I�@��s ${group.products.length} �Ӳ��~`)
      setEditingGroup(null)
      await load()
    } catch (error: any) {
      alert(`��s���ѡG${error.response?.data?.message || error.message}`)
    }
  }

  // Excel�ɥX�\��]�]�t���թM�Ƨǡ^
  function exportToExcel() {
    try {
      const exportData = []
      const headers = ['���~', '�ӫ~', '�ؤo', '�i�f', '�W�[', '�w�s��', '�[��', '�W�J', '��K��', '����', '�ꤺ��', '�`�w']
      exportData.push(headers)
      Object.values(groupedProducts).forEach(group => {
        const sortedProducts = sortProductsBySize([...group.products])
        sortedProducts.forEach(product => {
          const row = [
            product.productCode,
            product.name,
            getProductSize(product),
            getQuantity(product, locations.find(l => l.name === '�i�f')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�W�[')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�w�s��')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�[��')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�W�J')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '��K��')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '����')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�ꤺ��')?._id || ''),
            getQuantity(product, locations.find(l => l.name === '�`�w')?._id || '')
          ]
          exportData.push(row)
        })
      })
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '�w�s�޲z')
      const now = new Date()
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-')
      const filename = `�w�s�޲z_${timestamp}.xlsx`
      XLSX.writeFile(wb, filename)
      alert('Excel�ɥX���\�I')
    } catch (error) {
      console.error('�ɥXExcel���~:', error)
      alert('�ɥXExcel���ѡA�Э���')
    }
  }

  // �ɤJ�B�z��ơ]doImport / doTransfer / doExcelImport / doClearAll / �s��^
  async function doImport(type: 'incoming' | 'outgoing') {
    if (importState.locationId === '') {
      alert('�п�ܦa�I')
      return
    }
    if (importState.files.length === 0) {
      alert('�п��PDF���')
      return
    }
    
    try {
      const form = new FormData()
      form.append('locationId', importState.locationId)
      importState.files.forEach(f => form.append('files', f))
      
      // �T�O�ھ�type�եΥ��T��API���I
      const response = await api.post(`/import/${type}`, form)
      alert(`${type === 'incoming' ? '�i�f' : '�X�f'}���\�I\n�B�z:${response.data.processed}  �ǰt:${response.data.matched}  �s�W:${response.data.created}  ��s:${response.data.updated}\n�����: ${response.data.notFound?.join(', ') || '�L'}`)
      setImportOpen(false)
      await load()
    } catch (error: any) {
      alert(`${type === 'incoming' ? '�i�f' : '�X�f'}���ѡG${error.response?.data?.message || error.message}`)
    }
  }

  // �ಾ�w�s�B�z
  async function doTransfer() {
    if (transferState.fromLocationId === '' || transferState.toLocationId === '') {
      alert('�п�ܨӷ��a�I�M�ؼЦa�I')
      return
    }
    if (transferState.files.length === 0) {
      alert('�п��PDF���')
      return
    }
    
    try {
      const form = new FormData()
      form.append('fromLocationId', transferState.fromLocationId)
      form.append('toLocationId', transferState.toLocationId)
      transferState.files.forEach(f => form.append('files', f))
      
      const response = await api.post('/import/transfer', form)
      alert(`�ಾ�w�s���\�I\n�B�z:${response.data.processed}  �ǰt:${response.data.matched}  ��s:${response.data.updated}\n�����: ${response.data.notFound?.join(', ') || '�L'}`)
      setTransferOpen(false)
      await load()
    } catch (error: any) {
      alert(`�ಾ�w�s���ѡG${error.response?.data?.message || error.message}`)
    }
  }

  // Excel�ɤJ�B�z - �K�[���~�B�z
  async function doExcelImport() {
    if (excelImportState.files.length === 0) {
      alert('�п��Excel���')
      return
    }
    
    // �ˬd���j�p
    const totalSize = excelImportState.files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > 10 * 1024 * 1024) { // 10MB����
      alert('���Ӥj�W�L10MB�A�п�ܸ��p���')
      return
    }
    
    try {
      // ��ܳB�z������
      const processingMsg = '���b�B�zExcel���A�еy��...\n�o�i��ݭn�@�Ǯɶ��A�Ф��n���������C'
      alert(processingMsg)
      
      const form = new FormData()
      excelImportState.files.forEach(f => form.append('files', f))
      
      // �]�m�������W�ɮɶ�
      const response = await api.post('/import/excel', form, {
        timeout: 300000, // 5�����W��
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      // ��ܵ��G
      const resultMsg = `Excel�ɤJ���\�I
      
�B�z���: ${response.data.processed}
�ǰt�ӫ~: ${response.data.matched}
�s�W�ӫ~: ${response.data.created}
��s�ӫ~: ${response.data.updated}
���~�ƶq: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '���~�Ա�:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '�L���~'}`

      alert(resultMsg)
      setExcelImportOpen(false)
      await load()
    } catch (error: any) {
      console.error('Excel�ɤJ���~:', error)
      
      let errorMsg = 'Excel�ɤJ���ѡG'
      if (error.code === 'ECONNABORTED') {
        errorMsg += '�B�z�W�ɡA�п�ܸ��p�����ˬd�����s��'
      } else if (error.response?.status === 413) {
        errorMsg += '���Ӥj�A�п�ܸ��p���'
      } else if (error.response?.data?.message) {
        errorMsg += error.response.data.message
      } else {
        errorMsg += error.message
      }
      
      alert(errorMsg)
    }
  }

  // �M�s�Ҧ��w�s�ƶq
  async function doClearAll() {
    if (!confirm('�T�w�n�M�s�Ҧ��w�s�ܡH���ާ@�L�k�M�P�I')) {
      return
    }
    
    try {
      const response = await api.post('/import/clear')
      
      const resultMsg = `�M�s���\�I
      
�B�z�ӫ~: ${response.data.processed}
��s�ӫ~: ${response.data.updated}
���~�ƶq: ${response.data.errors?.length || 0}

${response.data.errors?.length > 0 ? '���~�Ա�:\n' + response.data.errors.slice(0, 5).join('\n') + (response.data.errors.length > 5 ? '\n...' : '') : '�L���~'}`

      alert(resultMsg)
      setClearOpen(false)
      await load()
    } catch (error: any) {
      console.error('�M�s���~:', error)
      
      let errorMsg = '�M�s���ѡG'
      if (error.response?.data?.message) {
        errorMsg += error.response.data.message
      } else {
        errorMsg += error.message
      }
      
      alert(errorMsg)
    }
  }

  // �s��M�R���B�z��� - �K�[���~�B�z
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
      alert('�ӫ~��s���\')
      setEditingProduct(null)
      await load()
    } catch (error: any) {
      alert(`��s���ѡG${error.response?.data?.message || error.message}`)
    }
  }

  async function handleDelete(product: Product) {
    if (confirm(`�T�w�n�R���ӫ~ "${product.name}" �ܡH`)) {
      try {
        await api.delete(`/products/${product._id}`)
        alert('�ӫ~�R�����\')
        await load()
      } catch (error: any) {
        alert(`�R�����ѡG${error.response?.data?.message || error.message}`)
      }
    }
  }

  // �R����Ӳ��~��
  async function handleDeleteGroup(group: ProductGroup) {
    if (confirm(`�T�w�n�R�����~�� "${group.name}" (${group.productCode}) �ܡH\n�o�N�R���Ӳդ��Ҧ����~�A���ާ@�L�k�M�P�I`)) {
      try {
        // ��q�R���Ӳդ��Ҧ����~
        const deletePromises = group.products.map(product => 
          api.delete(`/products/${product._id}`)
        )
        
        await Promise.all(deletePromises)
        alert(`���~�� "${group.name}" �R�����\�A�@�R�� ${group.products.length} �Ӳ��~`)
        await load()
      } catch (error: any) {
        alert(`�R�����ѡG${error.response?.data?.message || error.message}`)
      }
    }
  }

  // Group products by name and productCode�A���ؤo�Ƨ�
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

  // ��C�Ӹs�դ������~���ؤo�Ƨ�
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
        <h1>�w�s�޲z</h1>
        {isMobile && (
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMobileControlsOpen(o => !o)}>
              {mobileControlsOpen ? '���ñ���' : '��ܱ���'}
            </button>
          </div>
        )}
      </div>

      {(!isMobile || mobileControlsOpen) && (
        <div className="toolbar">
          <div className="filters">
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              <option value="">�Ҧ����~����</option>
              {productTypes.map(type => (
                <option key={type._id} value={type.name}>{type.name}</option>
              ))}
            </select>
            
            <input
              type="text"
              placeholder="�j�M���~..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />

            <input
              type="text"
              placeholder="�j�M�ؤo..."
              value={sizeSearchTerm}
              onChange={e => setSizeSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="spacer" />
          <button className="btn" onClick={exportToExcel}>�ɥXExcel</button>
          <button className="btn" onClick={() => setExcelImportOpen(true)}>�ɤJExcel</button>
          <button className="btn" onClick={() => setClearOpen(true)}>�M�s</button>
          <button className="btn" onClick={() => setImportOpen(true)}>�ɤJ�w�s</button>
          <button className="btn" onClick={() => setTransferOpen(true)}>�w�s�ಾ</button>
        </div>
      )}

      {/* ���e���G�]�t���D�M�ƾڡA�L�ݺu�� */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>���~</th>
              <th>�N�X</th>
              <th>�ؤo</th>
              {locations.map(location => (
                <th key={location._id} onClick={() => handleSort(location._id)} style={{ cursor: 'pointer' }}>
                  {location.name} {getSortIcon(location._id)}
                </th>
              ))}
              <th onClick={() => handleSort('total')} style={{ cursor: 'pointer' }}>
                �`�p {getSortIcon('total')}
              </th>
              <th>�ާ@</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groupedProducts).map((group: ProductGroup, groupIndex) => (
              <React.Fragment key={group.key}>
                <tr className="group-header" style={{ borderBottom: '2px solid #dc2626' }}>
                  <td colSpan={locations.length + 3} style={{ cursor: 'pointer' }} onClick={() => toggleGroup(group.key)}>
                    {expandedGroups.has(group.key) ? '��' : '?'} {group.name} ({group.productCode})
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {editingGroup === group.key ? (
                        // �s��Ҧ�
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
                            �O�s
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
                            ����
                          </button>
                        </>
                      ) : (
                        // ���`�Ҧ�
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
                            �s��
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
                            �R��
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedGroups.has(group.key) && (
                  editingGroup === group.key ? (
                    // �s��Ҧ� - ��ܽs����
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <td>
                        <input
                          type="text"
                          value={groupEditForm.name}
                          onChange={e => setGroupEditForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="���~�W��"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={groupEditForm.productCode}
                          onChange={e => setGroupEditForm(prev => ({ ...prev, productCode: e.target.value }))}
                          placeholder="���~�N�X"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                      </td>
                      <td colSpan={locations.length + 2} style={{ textAlign: 'center', color: '#6b7280' }}>
                        �s��Ҧ� - �קﲣ�~�W�٩M�N�X�N��s�Ӳդ��Ҧ����~
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
                      // �s��Ҧ�
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
                            <button className="btn" onClick={() => handleSaveEdit(product._id)}>�O�s</button>
                            <button className="btn secondary" onClick={handleCancelEdit}>����</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // ���`�Ҧ� - ��ܲ��~�ƾ�
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
                            <button className="btn ghost" onClick={() => handleEdit(product)}>�s��</button>
                            <button className="btn ghost" onClick={() => handleDelete(product)}>�R��</button>
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

      {/* �ɤJ�w�s�u�� */}
      {importOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�ɤJ�w�s</div>
            <div className="body">
              <div>
                <p>��ܦa�I�G</p>
                <select value={importState.locationId} onChange={e => setImportState(s => ({ ...s, locationId: e.target.value }))}>
                  <option value="">�п�ܦa�I</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>���PDF���G</p>
                <input multiple type="file" accept=".pdf" onChange={e => setImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setImportOpen(false)}>����</button>
              <button className="btn" onClick={() => doImport('incoming')}>�i�f</button>
              <button className="btn" onClick={() => doImport('outgoing')}>�X�f</button>
            </div>
          </div>
        </div>
      )}

      {/* �w�s�ಾ�u�� */}
      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�w�s�ಾ</div>
            <div className="body">
              <div>
                <p>�ӷ��a�I�G</p>
                <select value={transferState.fromLocationId} onChange={e => setTransferState(s => ({ ...s, fromLocationId: e.target.value }))}>
                  <option value="">�п�ܨӷ��a�I</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>�ؼЦa�I�G</p>
                <select value={transferState.toLocationId} onChange={e => setTransferState(s => ({ ...s, toLocationId: e.target.value }))}>
                  <option value="">�п�ܥؼЦa�I</option>
                  {locations.map(location => (
                    <option key={location._id} value={location._id}>{location.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p>���PDF���G</p>
                <input multiple type="file" accept=".pdf" onChange={e => setTransferState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setTransferOpen(false)}>����</button>
              <button className="btn" onClick={doTransfer}>�}�l</button>
            </div>
          </div>
        </div>
      )}

      {/* Excel�ɤJ�u�� */}
      {excelImportOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�ɤJExcel</div>
            <div className="body">
              <div style={{ marginBottom: '16px' }}>
                <p><strong>Excel�榡�n�D�G</strong></p>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>�C�C�G���~�N�X�B���~�W�١B���~�����B�ؤo�B�i�f�B�W�[�B�w�s�աB�[��B�W�J�B��K���B���ԡB�ꤺ�ܡB�`�w</li>
                  <li>���~�N�X�G���~�N�X�]�p�G���~�N�X�B�ӫ~�N�X�B���~�B�N�X�B�ӫ~�^</li>
                  <li>���~�W�١G���~�W�١]�p�G���~�W�١B�W�١B���~�B�W�١B�ӫ~�^</li>
                  <li>���~�����G�ؤo�]�p�G�ؤo�B�j�p�B�W�[�B�ؤo�B�W��^</li>
                  <li>�U�U�C�G�����w�s�ƶq�]�p�G�i�f�ƶq�B�W�[�ƶq�^</li>
                </ul>
              </div>
              <div>
                <p>���Excel���G</p>
                <input multiple type="file" accept=".xlsx,.xls" onChange={e => setExcelImportState(s => ({ ...s, files: Array.from(e.target.files || []) }))} />
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setExcelImportOpen(false)}>����</button>
              <button className="btn" onClick={doExcelImport}>�}�l�ɤJ</button>
            </div>
          </div>
        </div>
      )}

      {/* �M�s�T�{�u�� */}
      {clearOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="header">�M�s�Ҧ��w�s�ƶq</div>
            <div className="body">
              <p>?? ĵ�i�G���ާ@�N�M�s�Ҧ��w�s�ƶq�]�]��0�^�A���ާ@�L�k�M�P�I</p>
              <p>�T�w�n�~��ܡH</p>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => setClearOpen(false)}>����</button>
              <button className="btn danger" onClick={doClearAll}>�T�w�M�s</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
