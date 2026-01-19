import { useState, useEffect } from 'react';
import api from '../api';

interface DailySummary {
  date: string;
  totalPoints: number;
  orderCount: number;
  orders: Array<{
    orderNumber?: string;
    totalPoints: number;
    matchedCombos: string[];
    itemsCount: number;
  }>;
}

export default function PointsCalculation() {
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<DailySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dailyDetails, setDailyDetails] = useState<any[]>([]);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const response = await api.get('/points-calculation/daily');
      setSummary(response.data.summary || []);
      setDailyDetails(response.data.dailyPoints || []);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const response = await api.post('/points-calculation/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const successCount = response.data.results.filter((r: any) => r.saved).length;
      alert(`成功导入 ${successCount} 个订单`);
      loadSummary();
    } catch (error: any) {
      alert(error.response?.data?.error || '导入失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('确定要删除这条记录吗？')) return;

    try {
      await api.delete(`/points-calculation/daily/${id}`);
      alert('记录已删除');
      loadSummary();
    } catch (error) {
      alert('删除失败');
    }
  };

  const filteredDetails = selectedDate
    ? dailyDetails.filter(d => {
        const dateStr = new Date(d.date).toISOString().split('T')[0];
        return dateStr === selectedDate;
      })
    : dailyDetails;

  const totalPoints = summary.reduce((sum, item) => sum + item.totalPoints, 0);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>積分計算</h1>
        <label className="btn" style={{ cursor: 'pointer' }}>
          {uploading ? '上傳中...' : '導入賬單'}
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      </div>

      {/* 日期筛选 */}
      <div style={{ marginBottom: '20px' }}>
        <label className="label">
          選擇日期
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ maxWidth: '200px' }}
          />
        </label>
        {selectedDate && (
          <button
            className="btn secondary"
            onClick={() => setSelectedDate('')}
            style={{ marginLeft: '8px' }}
          >
            清除篩選
          </button>
        )}
      </div>

      {/* 总积分统计 */}
      {summary.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '16px', background: '#f3f4f6', borderRadius: '8px' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            總積分：{totalPoints}
          </div>
        </div>
      )}

      {/* 每日汇总 */}
      <div style={{ marginBottom: '30px' }}>
        <h2>每日匯總</h2>
        {summary.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ color: '#6b7280' }}>暂无数据</div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>訂單數量</th>
                  <th>總積分</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.date}</td>
                    <td>{item.orderCount}</td>
                    <td><strong>{item.totalPoints}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 详细记录 */}
      <div>
        <h2>詳細記錄</h2>
        {filteredDetails.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ color: '#6b7280' }}>暂无记录</div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>訂單編號</th>
                  <th>積分</th>
                  <th>匹配組合</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((detail) => (
                  <tr key={detail._id}>
                    <td>{new Date(detail.date).toLocaleDateString()}</td>
                    <td>{detail.orderNumber || '-'}</td>
                    <td><strong>{detail.totalPoints}</strong></td>
                    <td>
                      {detail.matchedCombos && detail.matchedCombos.length > 0
                        ? detail.matchedCombos.join(', ')
                        : '-'}
                    </td>
                    <td>
                      <button className="btn ghost" onClick={() => handleDeleteRecord(detail._id)}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

