import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        if (!email) {
          setError('請輸入電子郵件');
          setLoading(false);
          return;
        }
        await register(username, email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || '操作失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f6f7fb',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ margin: '0 0 24px 0', textAlign: 'center', color: '#111827' }}>
          {isLogin ? '登入' : '註冊'}
        </h2>

        {error && (
          <div style={{
            padding: '12px',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="label" style={{ marginBottom: '16px' }}>
            <label style={{ marginBottom: '6px', color: '#374151' }}>用戶名</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="請輸入用戶名"
            />
          </div>

          {!isLogin && (
            <div className="label" style={{ marginBottom: '16px' }}>
              <label style={{ marginBottom: '6px', color: '#374151' }}>電子郵件</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="請輸入電子郵件"
              />
            </div>
          )}

          <div className="label" style={{ marginBottom: '20px' }}>
            <label style={{ marginBottom: '6px', color: '#374151' }}>密碼</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="請輸入密碼"
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? '處理中...' : (isLogin ? '登入' : '註冊')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setUsername('');
              setEmail('');
              setPassword('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: '14px',
              textDecoration: 'underline'
            }}
          >
            {isLogin ? '還沒有帳號？點擊註冊' : '已有帳號？點擊登入'}
          </button>
        </div>
      </div>
    </div>
  );
}

