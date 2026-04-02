import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Message {
  id: string;
  role: 'dean' | 'user';
  content: string;
  isTyping?: boolean;
}

interface DeanData {
  name: string;
  title: string;
  identity: string;
  personality: string;
  coreViews: string[];
  speakingStyle: string;
  openingQuestion: string;
  soulColor: string;
}

interface Props {
  onClose: () => void;
}

interface SessionInfo {
  sessionId: string;
  lastChatAt: string;
  msgCount: number;
}

const SESSION_ID = '__dean__';
const SOUL_COLOR = '#c8a96e';

async function loadChatHistory(): Promise<Message[]> {
  try {
    const res = await fetch(`/api/h5/chat-history/${encodeURIComponent(SESSION_ID)}`);
    const json = await res.json();
    if (json.code !== 0 || !json.data) return [];
    return json.data.map((m: any) => ({
      id: `h_${m.id}`,
      role: m.role === 'user' ? 'user' : 'dean',
      content: m.content,
      isTyping: false,
    }));
  } catch {
    return [];
  }
}

async function saveMessage(role: string, content: string) {
  fetch('/api/h5/chat-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, role, content }),
  }).catch(() => {});
}

const DeanDialog: React.FC<Props> = ({ onClose }) => {
  const sc = SOUL_COLOR;
  const [dean, setDean] = useState<DeanData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [error, setError] = useState('');
  const [summonPhase, setSummonPhase] = useState<'summoning' | 'ready'>('summoning');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);
  const hasSavedOpeningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const atStartPosRef = useRef<number>(-1);

  // @ 引用选择器
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atSearch, setAtSearch] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [quotedRef, setQuotedRef] = useState<{ sessionId: string; context: string } | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Summon animation
    setTimeout(() => {
      setSummonPhase('ready');
      requestAnimationFrame(() => setFadeIn(true));
    }, 900);

    (async () => {
      const [deanRes, history] = await Promise.all([
        fetch('/api/h5/dean').then(r => r.json()).catch(() => ({ code: 1 })),
        loadChatHistory(),
      ]);

      let deanData: DeanData | null = null;
      if (deanRes.code === 0 && deanRes.data) {
        const d = deanRes.data;
        let coreViews: string[] = [];
        try { coreViews = JSON.parse(d.coreViews); } catch { coreViews = d.coreViews ? [d.coreViews] : []; }
        deanData = { ...d, coreViews };
      }
      setDean(deanData);

      if (history.length > 0) {
        setMessages(history);
        hasSavedOpeningRef.current = true;
      } else {
        const opening = deanData?.openingQuestion
          || '太虚书院欢迎你。你今日踏入此院，所求何事？是想探讨某位先贤的思想，还是心中已有疑惑待解？';
        setMessages([{ id: `d_${Date.now()}`, role: 'dean', content: opening, isTyping: false }]);
      }
    })();
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const streamChat = useCallback(async (history: { role: string; content: string }[]) => {
    const msgId = `d_${Date.now()}_${Math.random()}`;
    setMessages(prev => [...prev, { id: msgId, role: 'dean', content: '', isTyping: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/h5/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle: '__dean__', sessionId: SESSION_ID, messages: history }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
        throw new Error(err.message || `API 错误 ${resp.status}`);
      }

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.content || '';
              if (delta) {
                full += delta;
                const captured = full;
                setMessages(prev =>
                  prev.map(m => m.id === msgId ? { ...m, content: captured } : m)
                );
              }
            } catch {}
          }
        }
        const finalFull = full;
        setMessages(prev =>
          prev.map(m => m.id === msgId ? { ...m, isTyping: false } : m)
        );
        if (finalFull) saveMessage('assistant', finalFull);
      } else {
        const data = await resp.json();
        if (data.code !== 0) throw new Error(data.message || '对话服务异常');
        const content = data.data?.choices?.[0]?.message?.content || '';
        setMessages(prev =>
          prev.map(m => m.id === msgId ? { ...m, content, isTyping: false } : m)
        );
        if (content) saveMessage('assistant', content);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setError(e.message || '链接中断');
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, content: '（灵魂链接中断，请稍后再试。）', isTyping: false } : m)
      );
    } finally {
      abortRef.current = null;
      setIsThinking(false);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    setError('');
    setShowAtPicker(false);

    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    if (!hasSavedOpeningRef.current) {
      hasSavedOpeningRef.current = true;
      const opening = messages.find(m => m.role === 'dean');
      if (opening) saveMessage('assistant', opening.content);
    }
    saveMessage('user', text);

    // 若有引用上下文，拼入 LLM 消息（不影响展示）
    const effectiveContent = quotedRef ? `${quotedRef.context}\n\n${text}` : text;
    if (quotedRef) setQuotedRef(null);

    const history = [...messages, { ...userMsg, content: effectiveContent }]
      .filter(m => !m.isTyping)
      .map(m => ({ role: m.role === 'dean' ? 'assistant' : 'user', content: m.content }));

    await streamChat(history);
  }, [input, isThinking, messages, streamChat, quotedRef]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx >= 0) {
      const afterAt = textBeforeCursor.slice(lastAtIdx + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        if (afterAt.startsWith('《')) {
          setShowAtPicker(false);
          setInput(val);
          return;
        }
        atStartPosRef.current = lastAtIdx;
        setAtSearch(afterAt);
        setPickerIndex(0);
        setShowAtPicker(true);
        if (!sessionsLoaded) {
          setPickerLoading(true);
          fetch('/api/h5/chat-sessions')
            .then(r => r.json())
            .then(j => { if (j.code === 0) setSessions(j.data || []); setSessionsLoaded(true); })
            .catch(() => {})
            .finally(() => setPickerLoading(false));
        }
      } else {
        setShowAtPicker(false);
      }
    } else {
      setShowAtPicker(false);
    }
    setInput(val);
  }, [sessionsLoaded]);

  const selectSession = useCallback(async (s: SessionInfo) => {
    setShowAtPicker(false);
    setPickerLoading(true);
    try {
      const res = await fetch(`/api/h5/chat-history/${encodeURIComponent(s.sessionId)}`);
      const json = await res.json();
      const msgs: any[] = json.code === 0 ? (json.data || []) : [];
      const excerpt = msgs
        .slice(-12)
        .map((m: any) => `${m.role === 'user' ? '读者' : `${s.sessionId}（先贤）`}: ${m.content}`)
        .join('\n');
      const context = `【以下是读者与《${s.sessionId}》的灵魂对话摘录，请院长参考分析】\n${excerpt || '（对话内容为空）'}\n【引用结束】`;
      setQuotedRef({ sessionId: s.sessionId, context });
    } catch {
      setQuotedRef({ sessionId: s.sessionId, context: `【读者引用了与《${s.sessionId}》的灵魂对话（内容暂时无法加载）】` });
    } finally {
      setPickerLoading(false);
    }
    // 替换输入中的 @搜索词 为 @《书名》
    setInput(prev => {
      const pos = atStartPosRef.current;
      if (pos < 0) return prev;
      return prev.slice(0, pos) + `@《${s.sessionId}》` + prev.slice(pos + 1 + atSearch.length);
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [atSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAtPicker) {
      const count = sessions.filter(s => s.sessionId !== '__dean__' && (!atSearch || s.sessionId.includes(atSearch))).slice(0, atSearch ? 20 : 5).length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setPickerIndex(i => Math.min(i + 1, count - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPickerIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowAtPicker(false); return; }
      if (e.key === 'Enter') {
        const list = sessions.filter(s => !atSearch || s.sessionId.includes(atSearch)).slice(0, atSearch ? 20 : 5);
        if (list[pickerIndex]) { e.preventDefault(); selectSession(list[pickerIndex]); return; }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [showAtPicker, sessions, atSearch, pickerIndex, selectSession, sendMessage]);

  // Summoning overlay
  if (summonPhase === 'summoning') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10500,
        background: '#00040d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '24px',
      }}>
        <div style={{ position: 'relative', width: '120px', height: '120px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: `1.5px solid ${sc}`,
              animation: `summon-ring 1.2s ${i * 0.3}s ease-out infinite`,
              opacity: 0,
            }} />
          ))}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.8rem', animation: 'summon-icon 0.9s ease-in-out infinite alternate',
          }}>
            📜
          </div>
        </div>
        <div style={{
          color: `${sc}cc`, fontSize: '1rem', letterSpacing: '8px',
          fontFamily: '"KaiTi", "STKaiti", serif',
          animation: 'summon-text 0.8s ease-in-out infinite alternate',
        }}>
          召唤院长中…
        </div>
        <style>{`
          @keyframes summon-ring {
            0% { transform: scale(0.6); opacity: 0.8; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          @keyframes summon-icon {
            from { transform: scale(0.92); filter: drop-shadow(0 0 8px ${sc}80); }
            to { transform: scale(1.08); filter: drop-shadow(0 0 24px ${sc}); }
          }
          @keyframes summon-text {
            from { opacity: 0.5; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10500,
      background: '#00040d',
      opacity: fadeIn ? 1 : 0,
      transition: 'opacity 0.5s ease',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"KaiTi", "STKaiti", serif',
    }}>
      {/* 背景光晕 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 60% 50% at 50% 20%, ${sc}14 0%, transparent 70%)`,
      }} />

      {/* ===== 顶部标题栏 ===== */}
      <div style={{
        flexShrink: 0, height: '56px',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px',
        background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${sc}25`, zIndex: 1,
      }}>
        <div onClick={onClose} style={{
          cursor: 'pointer', color: 'rgba(200,220,255,0.55)', fontSize: '1.5rem',
          padding: '4px 10px', flexShrink: 0, lineHeight: 1,
        }}>‹</div>
        <div style={{
          flex: 1, textAlign: 'center', color: sc, fontSize: '1rem',
          letterSpacing: '8px', textShadow: `0 0 14px ${sc}90`,
        }}>太虚问道</div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: sc, fontSize: '0.88rem', letterSpacing: '2px' }}>{dean?.name || '太虚院长'}</div>
          <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '0.6rem', letterSpacing: '1px', marginTop: '1px' }}>
            {dean?.title || '太虚书院·院长'}
          </div>
        </div>
      </div>

      {/* ===== 院长档案卡片 ===== */}
      {dean && showProfile && (
        <div style={{
          margin: '10px 14px 0', padding: '12px 14px',
          background: `linear-gradient(135deg, ${sc}14, rgba(0,0,0,0.4))`,
          border: `1px solid ${sc}28`, borderRadius: '12px',
          fontSize: '0.72rem', color: 'rgba(190,210,250,0.65)',
          lineHeight: '1.75', flexShrink: 0, position: 'relative',
        }}>
          <div style={{ color: sc, fontSize: '0.8rem', marginBottom: '6px', letterSpacing: '2px', textShadow: `0 0 8px ${sc}60` }}>
            太虚书院 · 院长档案
          </div>
          <div style={{ marginBottom: '4px' }}>{dean.identity}</div>
          <div style={{ color: 'rgba(160,185,230,0.45)', fontSize: '0.68rem' }}>
            {dean.coreViews.slice(0, 2).join(' · ')}
          </div>
          <div onClick={() => setShowProfile(false)} style={{
            position: 'absolute', top: '8px', right: '10px',
            cursor: 'pointer', color: 'rgba(150,170,210,0.3)', fontSize: '0.8rem',
            padding: '2px 4px',
          }}>✕</div>
        </div>
      )}

      {/* ===== 消息区域 ===== */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: '18px',
        scrollbarWidth: 'thin', scrollbarColor: `${sc}30 transparent`,
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            flexDirection: msg.role === 'dean' ? 'row' : 'row-reverse',
          }}>
            {msg.role === 'dean' && (
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: `radial-gradient(circle at 40% 35%, ${sc}70, ${sc}25)`,
                border: `1px solid ${sc}70`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fffbe8', fontSize: '0.9rem',
                boxShadow: `0 0 14px ${sc}50`,
              }}>
                院
              </div>
            )}
            <div style={{
              maxWidth: '75%', padding: '11px 15px',
              borderRadius: msg.role === 'dean' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
              background: msg.role === 'dean'
                ? `linear-gradient(135deg, ${sc}1a, rgba(8,14,42,0.85))`
                : 'rgba(28,38,72,0.8)',
              border: msg.role === 'dean'
                ? `1px solid ${sc}38`
                : '1px solid rgba(70,90,150,0.3)',
              color: msg.role === 'dean' ? '#ddeeff' : 'rgba(195,210,240,0.85)',
              fontSize: '0.88rem', lineHeight: '1.8', letterSpacing: '0.5px',
              boxShadow: msg.role === 'dean' ? `0 2px 18px ${sc}18` : 'none',
            }}>
              {msg.isTyping && !msg.content ? (
                <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                      background: sc, opacity: 0.6,
                      animation: `thinking-dot 1.3s ${i * 0.22}s ease-in-out infinite`,
                    }} />
                  ))}
                </span>
              ) : (
                <>
                  {msg.content}
                  {msg.isTyping && (
                    <span style={{ opacity: 0.5, animation: 'cursor-blink 0.8s infinite' }}>▌</span>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== 错误提示 ===== */}
      {error && (
        <div style={{
          margin: '0 14px', padding: '6px 12px', borderRadius: '8px',
          background: 'rgba(200,50,50,0.12)', border: '1px solid rgba(200,80,80,0.25)',
          color: 'rgba(255,150,130,0.7)', fontSize: '0.68rem', letterSpacing: '0.5px',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* ===== 输入区域 + @ 引用选择器 ===== */}
      <div style={{ position: 'relative', flexShrink: 0 }}>

        {/* @ 选择器浮层 */}
        {showAtPicker && (
          <div style={{
            position: 'absolute', bottom: '100%', left: '14px', right: '14px', marginBottom: '6px', zIndex: 20,
            background: 'rgba(4,10,30,0.97)', backdropFilter: 'blur(16px)',
            border: `1px solid ${sc}30`, borderRadius: '12px',
            maxHeight: '240px', overflowY: 'auto',
            boxShadow: `0 -4px 28px rgba(0,0,0,0.65), 0 0 24px ${sc}10`,
            scrollbarWidth: 'thin', scrollbarColor: `${sc}25 transparent`,
          }}>
            <div style={{
              padding: '7px 12px 6px', borderBottom: `1px solid ${sc}15`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, background: 'rgba(4,10,30,0.97)', zIndex: 1,
            }}>
              <span style={{ color: `${sc}cc`, fontSize: '0.68rem', letterSpacing: '2px' }}>引用灵魂对话</span>
              <span style={{ color: 'rgba(150,170,210,0.25)', fontSize: '0.58rem' }}>↑↓  Enter  Esc</span>
            </div>
            {pickerLoading && sessions.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: `${sc}50`, fontSize: '0.7rem' }}>加载中…</div>
            ) : (() => {
              const list = sessions.filter(s => s.sessionId !== '__dean__' && (!atSearch || s.sessionId.includes(atSearch))).slice(0, atSearch ? 20 : 5);
              return list.length === 0 ? (
                <div style={{ padding: '14px', textAlign: 'center', color: 'rgba(150,170,210,0.3)', fontSize: '0.7rem' }}>
                  {atSearch ? `未找到「${atSearch}」相关对话` : '暂无灵魂对话记录'}
                </div>
              ) : list.map((s, i) => (
                <div
                  key={s.sessionId}
                  onClick={() => selectSession(s)}
                  onMouseEnter={() => setPickerIndex(i)}
                  style={{
                    padding: '9px 14px', cursor: 'pointer',
                    background: i === pickerIndex ? `${sc}18` : 'transparent',
                    borderBottom: i < list.length - 1 ? `1px solid ${sc}0d` : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  <div>
                    <div style={{ color: i === pickerIndex ? sc : 'rgba(190,210,250,0.75)', fontSize: '0.82rem', letterSpacing: '1px' }}>
                      《{s.sessionId}》
                    </div>
                    <div style={{ color: 'rgba(150,170,210,0.35)', fontSize: '0.6rem', marginTop: '2px' }}>
                      {s.msgCount} 条对话 · {new Date(s.lastChatAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {i === pickerIndex && (
                    <span style={{ color: `${sc}60`, fontSize: '0.6rem', flexShrink: 0, marginLeft: '8px' }}>↵ 引用</span>
                  )}
                </div>
              ));
            })()}
          </div>
        )}

        {/* 引用标签 */}
        {quotedRef && (
          <div style={{ padding: '5px 14px 0', background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(14px)' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: `${sc}12`, border: `1px solid ${sc}30`,
              borderRadius: '20px', padding: '3px 10px 3px 8px',
              fontSize: '0.67rem', color: `${sc}cc`, letterSpacing: '0.5px',
            }}>
              <span style={{ opacity: 0.65 }}>📎</span>
              已引用《{quotedRef.sessionId}》对话
              <span
                onClick={() => setQuotedRef(null)}
                style={{ cursor: 'pointer', opacity: 0.45, fontSize: '0.7rem', marginLeft: '2px' }}
              >✕</span>
            </span>
          </div>
        )}

        <div style={{
          padding: `${quotedRef ? '5px' : '10px'} 14px 14px`,
          background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(14px)',
          borderTop: `1px solid ${sc}20`,
          display: 'flex', gap: '10px', alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="向院长提问… 输入 @ 可引用灵魂对话 (Enter 发送)"
            rows={2}
            style={{
              flex: 1, background: 'rgba(12,22,52,0.75)',
              border: `1px solid ${sc}30`, borderRadius: '12px',
              padding: '10px 14px', color: '#c8deff',
              fontSize: '0.88rem', outline: 'none', resize: 'none',
              lineHeight: '1.6', letterSpacing: '0.5px', caretColor: sc,
              fontFamily: '"KaiTi", "STKaiti", serif',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => {
              e.target.style.borderColor = `${sc}55`;
              e.target.style.boxShadow = `0 0 14px ${sc}20`;
            }}
            onBlur={e => {
              e.target.style.borderColor = `${sc}30`;
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isThinking}
            style={{
              width: '44px', height: '44px', borderRadius: '50%', border: 'none',
              background: !input.trim() || isThinking
                ? 'rgba(30,45,80,0.6)'
                : `linear-gradient(135deg, ${sc}dd, ${sc}99)`,
              color: !input.trim() || isThinking ? 'rgba(120,150,200,0.35)' : '#fff',
              fontSize: '1.1rem', cursor: !input.trim() || isThinking ? 'not-allowed' : 'pointer',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: !input.trim() || isThinking ? 'none' : `0 0 18px ${sc}55`,
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes cursor-blink { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes thinking-dot {
          0%, 60%, 100% { transform: scale(1); opacity: 0.4; }
          30% { transform: scale(1.5); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default DeanDialog;
