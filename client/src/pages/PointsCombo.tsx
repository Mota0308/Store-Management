import { useState, useEffect } from 'react';
import api from '../api';

interface Product {
  _id: string;
  name: string;
  productCode: string;
  points?: number;
}

interface PointsCombo {
  _id: string;
  name: string;
  description?: string;
  productCodes: string[];
  comboPoints: number;
}

export default function PointsCombo() {
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<PointsCombo[]>([]);
  const [selectedProductCodes, setSelectedProductCodes] = useState<Set<string>>(new Set());
  const [comboName, setComboName] = useState('');
  const [comboDescription, setComboDescription] = useState('');
  const [comboPoints, setComboPoints] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<PointsCombo | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProducts();
    loadCombos();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data || []);
    } catch (error) {
      console.error('加载产品失败:', error);
    }
  };

  const loadCombos = async () => {
    try {
      const response = await api.get('/points-combo');
      setCombos(response.data || []);
    } catch (error) {
      console.error('加载积分组合失败:', error);
    }
  };

  const handleProductToggle = (productCode: string) => {
    setSelectedProductCodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productCode)) {
        newSet.delete(productCode);
      } else {
        newSet.add(productCode);
      }
      return newSet;
    });
  };

  const handleCreateCombo = async () => {
    if (!comboName.trim()) {
      alert('请输入组合名称');
      return;
    }

    if (selectedProductCodes.size === 0) {
      alert('请至少选择一个产品');
      return;
    }

    if (!comboPoints || parseInt(comboPoints) < 0) {
      alert('请输入有效的组合积分');
      return;
    }

    try {
      await api.post('/points-combo', {
        name: comboName,
        description: comboDescription,
        productCodes: Array.from(selectedProductCodes),
        comboPoints: parseInt(comboPoints)
      });

      alert('积分组合创建成功');
      setShowCreateModal(false);
      resetForm();
      loadCombos();
    } catch (error: any) {
      alert(error.response?.data?.error || '创建积分组合失败');
    }
  };

  const handleUpdateCombo = async () => {
    if (!editingCombo) return;
    
    try {
      await api.put(`/points-combo/${editingCombo._id}`, {
        name: comboName,
        description: comboDescription,
        productCodes: Array.from(selectedProductCodes),
        comboPoints: parseInt(comboPoints)
      });

      alert('积分组合更新成功');
      setShowCreateModal(false);
      setEditingCombo(null);
      resetForm();
      loadCombos();
    } catch (error: any) {
      alert(error.response?.data?.error || '更新积分组合失败');
    }
  };

  const handleDeleteCombo = async (id: string) => {
    if (!confirm('确定要删除这个积分组合吗？')) return;

    try {
      await api.delete(`/points-combo/${id}`);
      alert('积分组合已删除');
      loadCombos();
    } catch (error) {
      alert('删除积分组合失败');
    }
  };

  const resetForm = () => {
    setComboName('');
    setComboDescription('');
    setComboPoints('');
    setSelectedProductCodes(new Set());
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.productCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>積分組合</h1>
        <button className="btn" onClick={() => {
          setEditingCombo(null);
          resetForm();
          setShowCreateModal(true);
        }}>
          創建新組合
        </button>
      </div>

      {/* 组合列表 */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {combos.map(combo => (
          <div key={combo._id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0' }}>{combo.name}</h3>
                {combo.description && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>{combo.description}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn ghost" onClick={() => {
                  setEditingCombo(combo);
                  setComboName(combo.name);
                  setComboDescription(combo.description || '');
                  setComboPoints(combo.comboPoints.toString());
                  setSelectedProductCodes(new Set(combo.productCodes));
                  setShowCreateModal(true);
                }}>編輯</button>
                <button className="btn ghost" onClick={() => handleDeleteCombo(combo._id)}>刪除</button>
              </div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>組合積分：</strong>{combo.comboPoints}
            </div>
            <div>
              <strong>包含產品：</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {combo.productCodes.map((code, idx) => {
                  const product = products.find(p => p.productCode === code);
                  return (
                    <div key={idx} style={{
                      padding: '8px 12px',
                      background: '#f3f4f6',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}>
                      {product ? `${product.name} (${code})` : code}
                      {product?.points !== undefined && (
                        <span style={{ color: '#6b7280', marginLeft: '4px' }}>
                          [{product.points} 積分]
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 创建/编辑模态框 */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => {
          setShowCreateModal(false);
          setEditingCombo(null);
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="header">
              {editingCombo ? '編輯積分組合' : '創建積分組合'}
            </div>
            <div className="body">
              <div style={{ marginBottom: '16px' }}>
                <label className="label">
                  組合名稱 *
                  <input className="input" value={comboName} onChange={(e) => setComboName(e.target.value)} />
                </label>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">
                  描述
                  <textarea className="input" value={comboDescription} onChange={(e) => setComboDescription(e.target.value)} rows={3} />
                </label>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">
                  組合積分 *
                  <input className="input" type="number" min="0" value={comboPoints} onChange={(e) => setComboPoints(e.target.value)} />
                </label>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px', fontWeight: 500 }}>選擇產品 *</div>
                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="搜索产品..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ maxWidth: '300px' }}
                  />
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', maxHeight: '300px', overflow: 'auto' }}>
                  {filteredProducts.map(product => (
                    <div key={product._id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px',
                      borderBottom: '1px solid #f3f4f6'
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedProductCodes.has(product.productCode)}
                        onChange={() => handleProductToggle(product.productCode)}
                        style={{ marginRight: '12px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{product.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {product.productCode}
                          {product.points !== undefined && (
                            <span style={{ marginLeft: '8px', color: '#3b82f6' }}>
                              {product.points} 積分
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="footer">
              <button className="btn secondary" onClick={() => {
                setShowCreateModal(false);
                setEditingCombo(null);
              }}>取消</button>
              <button className="btn" onClick={editingCombo ? handleUpdateCombo : handleCreateCombo}>
                {editingCombo ? '更新' : '創建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

