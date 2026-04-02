import React, { useState } from 'react';

interface AuthUser {
  id: number;
  username: string;
  nickname: string | null;
}

interface Props {
  onSuccess: (user: AuthUser, token: string) => void;
  onClose?: () => void;
  /** If true, show a notice that the guest message limit has been reached */
  isLimitReached?: boolean;
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(8,18,50,0.7)',
  border: '1px solid rgba(80,120,200,0.3)',
  borderRadius: '8px',
  color: 'rgba(200,220,255,0.9)',
  fontSize: '15px',
  padding: '10px 14px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: '"KaiTi", "STKaiti", serif',
  letterSpacing: '1px',
};

const BTN_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  background: 'linear-gradient(135deg, rgba(80,120,220,0.85) 0%, rgba(50,90,180,0.85) 100%)',
  color: '#fff',
  fontSize: '16px',
  fontFamily: '"KaiTi", "STKaiti", serif',
  letterSpacing: '3px',
  cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(60,100,220,0.3)',
  transition: 'opacity 0.2s',
};

const LoginModal: React.FC<Props> = ({ onSuccess, onClose, isLimitReached }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setUsername(''); setPassword(''); setNickname(''); setError(''); };

  const switchTab = (t: 'login' | 'register') => { setTab(t); reset(); };

  const submit = async () => {
    if (!username.trim() || !password.trim()) { setError('请填写用户名和密码'); return; }
    setLoading(true); setError('');
    try {
      const url = tab === 'login' ? '/api/h5/auth/login' : '/api/h5/auth/register';
      const body: Record<string, string> = { username: username.trim(), password };
      if (tab === 'register' && nickname.trim()) body.nickname = nickname.trim();
      if (tab === 'register') {
        const inviterCode = localStorage.getItem('txbt_invite');
        if (inviterCode) body.inviterCode = inviterCode;
        const fp = localStorage.getItem('txbt_fp');
        if (fp) body.fingerprint = fp;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.code !== 0) { setError(json.message || '操作失败'); return; }
      if (tab === 'register') localStorage.removeItem('txbt_invite');
      onSuccess(json.data.user, json.data.token);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const goldColor = '#c8a96e';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,2,10,0.78)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        width: '90%', maxWidth: '380px',
        background: 'linear-gradient(160deg, #050d28 0%, #020918 100%)',
        border: '1px solid rgba(80,120,200,0.22)',
        borderRadius: '18px',
        padding: '32px 28px 28px',
        boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
        position: 'relative',
        fontFamily: '"KaiTi", "STKaiti", serif',
      }}>
        {/* 关闭 */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '14px', right: '16px',
              background: 'none', border: 'none', color: 'rgba(150,180,240,0.45)',
              fontSize: '20px', cursor: 'pointer', lineHeight: 1,
            }}
          >✕</button>
        )}

        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '26px', color: goldColor, letterSpacing: '4px', textShadow: `0 0 12px ${goldColor}55` }}>
            太虚书院
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(200,169,110,0.4)', letterSpacing: '2px', marginTop: '4px' }}>
            登录以解锁完整修炼之旅
          </div>
        </div>

        {/* 访客限制提示 */}
        {isLimitReached && (
          <div style={{
            background: 'rgba(200,100,80,0.12)',
            border: '1px solid rgba(220,130,100,0.25)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '18px',
            color: 'rgba(255,180,150,0.85)',
            fontSize: '13px',
            lineHeight: '1.6',
            letterSpacing: '0.5px',
          }}>
            访客畅言次数已达上限，登录后可无限与先贤对话 ✦
          </div>
        )}

        {/* Tab 切换 */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(80,120,200,0.15)', marginBottom: '22px' }}>
          {(['login', 'register'] as const).map(t => (
            <div
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1, textAlign: 'center', paddingBottom: '10px',
                fontSize: '15px', letterSpacing: '3px', cursor: 'pointer',
                color: tab === t ? '#7dd3fc' : 'rgba(160,185,240,0.35)',
                borderBottom: tab === t ? '2px solid #7dd3fc' : '2px solid transparent',
                transition: 'color 0.25s, border-color 0.25s',
              }}
            >
              {t === 'login' ? '登　录' : '注　册'}
            </div>
          ))}
        </div>

        {/* 表单 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            style={INPUT_STYLE}
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            maxLength={20}
            autoComplete="username"
          />
          <input
            style={INPUT_STYLE}
            type="password"
            placeholder="密码（不少于6位）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            maxLength={50}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />
          {tab === 'register' && (
            <input
              style={INPUT_STYLE}
              placeholder="昵称（可选）"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={20}
            />
          )}
          {error && (
            <div style={{ color: 'rgba(255,140,120,0.85)', fontSize: '13px', letterSpacing: '0.5px' }}>
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={loading}
            style={{ ...BTN_STYLE, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '请稍候…' : tab === 'login' ? '登　录' : '注　册'}
          </button>
        </div>

        {/* 装饰 */}
        <div style={{ textAlign: 'center', marginTop: '18px', color: 'rgba(200,169,110,0.18)', fontSize: '12px', letterSpacing: '2px' }}>
          ※ 太虚书院 · 与古今先贤对话 ※
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
