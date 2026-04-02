import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Message {
  id: string;
  role: 'author' | 'user';
  content: string;
  isTyping?: boolean;
  guestAuthor?: { name: string; color: string; title: string };
}

interface BookItem {
  id: string;
  title: string;
  author: string;
  era: string;
  soulColor: string;
}

interface BookData {
  id: string;
  title: string;
  author: string;
  era: string;
  soulColor: string;
}

interface PersonaData {
  identity: string;
  personality: string;
  coreViews: string[];
  knowledgeLimits: string;
  speakingStyle: string;
  openingQuestion: string;
}

interface Props {
  book: BookData;
  onClose: () => void;
  userId?: string;
  isGuest?: boolean;
  guestMsgCount?: number;
  guestLimit?: number;
  onGuestLimitReached?: () => void;
  onUserMessage?: () => void;
  /** total score for rank display, undefined if guest */
  userScore?: number;
  /** display name (nickname 或 username) */
  userDisplayName?: string;
}

function getSessionId(bookTitle: string) {
  return bookTitle.replace(/《|》/g, '');
}

async function fetchPersona(bookTitle: string): Promise<PersonaData | null> {
  try {
    const cleanTitle = bookTitle.replace(/《|》/g, '');
    const res = await fetch('/api/h5/books');
    const json = await res.json();
    if (json.code !== 0 || !json.data) return null;
    const book = json.data.find((b: any) =>
      b.title === cleanTitle || b.title === bookTitle
    );
    if (!book?.persona) return null;
    const p = book.persona;
    let coreViews: string[] = [];
    try { coreViews = JSON.parse(p.coreViews); } catch { coreViews = p.coreViews ? [p.coreViews] : []; }
    return {
      identity: p.identity,
      personality: p.personality,
      coreViews,
      knowledgeLimits: p.knowledgeLimits,
      speakingStyle: p.speakingStyle,
      openingQuestion: p.openingQuestion,
    };
  } catch {
    return null;
  }
}

async function loadChatHistory(sessionId: string): Promise<{ messages: Message[]; conversationId: string | null }> {
  try {
    const res = await fetch(`/api/h5/chat-history/${encodeURIComponent(sessionId)}`);
    const json = await res.json();
    if (json.code !== 0 || !json.data) return { messages: [], conversationId: null };
    const messages: Message[] = json.data.map((m: any) => {
      // New schema: role === 'guest' has speakerName + guestBookTitle
      if (m.role === 'guest') {
        return {
          id: `h_${m.id}`,
          role: 'author' as const,
          content: m.content,
          isTyping: false,
          guestAuthor: { title: m.guestBookTitle || '', name: m.speakerName || '', color: '#8ec8f8' },
        };
      }
      // Legacy: parse [《X》·Y] prefix from old data
      const guestMatch = m.role === 'author' && m.content.match(/^\[《([^\u300b]+)》[··]([^\]]+?)(?:说)?\] /);
      if (guestMatch) {
        return {
          id: `h_${m.id}`,
          role: 'author' as const,
          content: m.content.slice(guestMatch[0].length),
          isTyping: false,
          guestAuthor: { title: guestMatch[1], name: guestMatch[2], color: '#8ec8f8' },
        };
      }
      return {
        id: `h_${m.id}`,
        role: m.role === 'user' ? 'user' as const : 'author' as const,
        content: m.content,
        isTyping: false,
      };
    });
    return { messages, conversationId: json.conversationId ?? null };
  } catch {
    return { messages: [], conversationId: null };
  }
}

function generateConversationId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function saveMessage(
  sessionId: string,
  conversationId: string,
  role: string,
  content: string,
  userId: string | undefined,
  opts?: { speakerName?: string; guestBookTitle?: string },
) {
  fetch('/api/h5/chat-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, conversationId, role, content, userId: userId || null, ...opts }),
  }).catch(() => {});
}

const SoulDialog: React.FC<Props> = ({ book, onClose, userId, isGuest, guestMsgCount = 0, guestLimit = 3, onGuestLimitReached, onUserMessage, userScore, userDisplayName }) => {
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const sc = book.soulColor;
  const sessionId = getSessionId(book.title);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [showPersona, setShowPersona] = useState(true);
  const [error, setError] = useState('');

  const [showNewChatWarn, setShowNewChatWarn] = useState(false);
  const [showRegenWarn, setShowRegenWarn] = useState(false);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [noteGenerated, setNoteGenerated] = useState(false);
  const [noteToast, setNoteToast] = useState('');
  // 记录笔谈生成时的消息数，用于判断是否有新对话
  const noteMessageCountRef = useRef<number>(0);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);

  // @ 提及其他作者
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atSearch, setAtSearch] = useState('');
  const [bookList, setBookList] = useState<BookItem[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [guestAuthor, setGuestAuthor] = useState<{ title: string; author: string; color: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);
  const hasSavedOpeningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const askedQuestionsRef = useRef<string[]>([]);
  const atStartPosRef = useRef<number>(-1);
  const conversationIdRef = useRef<string>(generateConversationId());
  const isSendingRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    requestAnimationFrame(() => setFadeIn(true));

    (async () => {
      const [p, historyResult] = await Promise.all([
        fetchPersona(book.title),
        loadChatHistory(sessionId),
      ]);
      setPersona(p);
      const { messages: history, conversationId: existingConvId } = historyResult;
      if (existingConvId) conversationIdRef.current = existingConvId;
      if (history.length > 0) {
        setMessages(history);
        hasSavedOpeningRef.current = true;
        // 检查本次对话是否已有笔谈
        if (existingConvId) {
          fetch(`/api/h5/notes/check/${encodeURIComponent(getSessionId(book.title))}?conversationId=${encodeURIComponent(existingConvId)}`)
            .then(r => r.json())
            .then(j => {
              if (j.code === 0 && j.data) {
                const { hasNote, hasNewMessages } = j.data;
                if (hasNote && !hasNewMessages) {
                  // 已有笔谈且无新消息，标记为已归档
                  setNoteGenerated(true);
                  noteMessageCountRef.current = history.length;
                }
              }
            })
            .catch(() => {});
        }
      } else {
        // 支持多条开场白（用换行分隔），随机选一条
        let opening = `你好，我是${book.author}。你有什么想与我探讨的话题？`;
        if (p?.openingQuestion) {
          const lines = p.openingQuestion.split('\n').map((l: string) => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            opening = lines[Math.floor(Math.random() * lines.length)];
          }
        }
        setMessages([{ id: `a_${Date.now()}`, role: 'author', content: opening, isTyping: false }]);
        // 不立即保存开场白，只有用户真正发言后才持久化
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
    const msgId = `a_${Date.now()}_${Math.random()}`;
    const convId = conversationIdRef.current;
    setMessages(prev => [...prev, { id: msgId, role: 'author', content: '', isTyping: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/h5/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: book.title,
          sessionId,
          messages: history,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
        throw new Error(err.message || `API 错误 ${resp.status}`);
      }

      const contentType = resp.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // SSE 流式读取
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

        setMessages(prev =>
          prev.map(m => m.id === msgId ? { ...m, isTyping: false } : m)
        );
        if (full) saveMessage(sessionId, convId, 'author', full, undefined);
      } else {
        // 非流式兜底
        const data = await resp.json();
        if (data.code !== 0) throw new Error(data.message || '对话服务异常');
        const content = data.data?.choices?.[0]?.message?.content || '';
        setMessages(prev =>
          prev.map(m => m.id === msgId ? { ...m, content, isTyping: false } : m)
        );
        if (content) saveMessage(sessionId, convId, 'author', content, undefined);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setError(e.message || '链接中断');
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, content: '（灵魂链接中断，请稍后再试。）', isTyping: false } : m)
      );
    } finally {
      abortRef.current = null;
    }
  }, [book.title, sessionId]);

  const streamChatAsGuest = useCallback(async (
    guestTitle: string,
    guestAuthorName: string,
    guestColor: string,
    history: { role: string; content: string }[],
  ) => {
    const msgId = `a_${Date.now()}_g`;
    setMessages(prev => [...prev, {
      id: msgId, role: 'author', content: '', isTyping: true,
      guestAuthor: { name: guestAuthorName, color: guestColor, title: guestTitle },
    }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';

    try {
      const resp = await fetch('/api/h5/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestBookTitle: guestTitle,
          bookTitle: book.title,
          sessionId,
          messages: history,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`API 错误 ${resp.status}`);

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.content || '';
              if (delta) {
                full += delta;
                const captured = full;
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: captured } : m));
              }
            } catch {}
          }
        }
      } else {
        const data = await resp.json();
        if (data.code !== 0) throw new Error(data.message || '服务异常');
        full = data.data?.choices?.[0]?.message?.content || '';
      }

      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isTyping: false } : m));
      if (full) {
        saveMessage(sessionId, conversationIdRef.current, 'guest', full, undefined, {
          speakerName: guestAuthorName,
          guestBookTitle: guestTitle,
        });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setError(e.message || '魂魄连接中断');
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '（魔力传递失败，请稍后再试。）', isTyping: false } : m));
    } finally {
      abortRef.current = null;
    }
  }, [book.title, sessionId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // 如果已选定访客作者，不再触发 picker
    if (guestAuthor) {
      setShowAtPicker(false);
      setInput(val);
      return;
    }
    const pos = e.target.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, pos);
    const lastAtIdx = beforeCursor.lastIndexOf('@');
    if (lastAtIdx >= 0) {
      const afterAt = beforeCursor.slice(lastAtIdx + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        // 如果是《开头说明已解析
        if (afterAt.startsWith('《')) {
          setShowAtPicker(false);
          setInput(val);
          return;
        }
        atStartPosRef.current = lastAtIdx;
        setAtSearch(afterAt);
        setPickerIndex(0);
        setShowAtPicker(true);
        if (!booksLoaded) {
          setPickerLoading(true);
          fetch('/api/h5/books')
            .then(r => r.json())
            .then(j => {
              if (j.code === 0 && j.data) {
                const currentClean = book.title.replace(/《|》/g, '');
                const list: BookItem[] = j.data
                  .filter((b: any) => b.title !== currentClean && b.title !== book.title)
                  .map((b: any) => ({
                    id: b.id,
                    title: b.title,
                    author: b.author,
                    era: b.era || '',
                    soulColor: b.soulColor || '#8ec8f8',
                  }));
                setBookList(list);
              }
              setBooksLoaded(true);
            })
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
  }, [booksLoaded, book.title, guestAuthor]);

  const selectGuestBook = useCallback((b: BookItem) => {
    const pos = atStartPosRef.current;
    if (pos < 0) return;
    // 插入作者名（而非书名）
    setInput(prev => prev.slice(0, pos) + `@${b.author}` + prev.slice(pos + 1 + atSearch.length));
    setGuestAuthor({ title: b.title, author: b.author, color: b.soulColor });
    setShowAtPicker(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [atSearch]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || isSendingRef.current) return;

    // 访客次数限制检查
    if (isGuest && guestMsgCount >= guestLimit) {
      onGuestLimitReached?.();
      return;
    }

    isSendingRef.current = true;
    setInput('');
    setError('');

    const currentGuest = guestAuthor;
    setGuestAuthor(null);

    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    // 首次发言时，先保存开场白
    if (!hasSavedOpeningRef.current) {
      hasSavedOpeningRef.current = true;
      const opening = messages.find(m => m.role === 'author');
      if (opening) {
        saveMessage(sessionId, conversationIdRef.current, 'author', opening.content, undefined);
      }
    }

    // 保存用户消息（含 userId，用于统计访客次数）
    saveMessage(sessionId, conversationIdRef.current, 'user', text, userId);
    // 通知 App 捏不访客计数
    if (isGuest) onUserMessage?.();

    // 构建历史，访客回复用其作者名标注
    const history = [...messages, userMsg]
      .filter(m => !m.isTyping)
      .map(m => ({
        role: m.role === 'author' ? 'assistant' : 'user',
        content: m.guestAuthor ? `[《${m.guestAuthor.title}》·${m.guestAuthor.name}说] ${m.content}` : m.content,
      }));

    try {
      if (currentGuest) {
        await streamChatAsGuest(currentGuest.title, currentGuest.author, currentGuest.color, history);
      } else {
        await streamChat(history);
      }
      // 已归档后继续对话，允许重新生成笔谈
      // 有新消息，笔谈状态不强制重置
    } finally {
      setIsThinking(false);
      isSendingRef.current = false;
    }
  }, [input, isThinking, messages, sessionId, streamChat, streamChatAsGuest, guestAuthor, userId, isGuest, guestMsgCount, guestLimit, onGuestLimitReached]);

  const askQuestion = useCallback(async () => {
    if (isThinking || isAskingQuestion) return;
    setIsAskingQuestion(true);
    setError('');

    const prevQs = askedQuestionsRef.current;
    const prevQStr = prevQs.length > 0
      ? `请不要重复以下已提过的问题：\n${prevQs.map((q, i) => `${i + 1}. ${q.slice(0, 50)}`).join('\n')}`
      : '';
    const trigger = `（你问我答指令：请以${book.author}的身份，结合《${book.title}》核心内容和我们刚才的交流，向我提出一个有深度的问题让我来思考和回答。要求：问题简洁有力，以问号结尾，不超过60字。${prevQStr}）`;

    const history = [...messages]
      .filter(m => !m.isTyping)
      .map(m => ({ role: m.role === 'author' ? 'assistant' : 'user', content: m.content }));
    history.push({ role: 'user', content: trigger });

    const msgId = `a_${Date.now()}_q`;
    setMessages(prev => [...prev, { id: msgId, role: 'author', content: '', isTyping: true }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';

    try {
      const resp = await fetch('/api/h5/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle: book.title, sessionId, messages: history }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`API 错误 ${resp.status}`);

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.content || '';
              if (delta) {
                full += delta;
                const captured = full;
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: captured } : m));
              }
            } catch {}
          }
        }
      } else {
        const data = await resp.json();
        if (data.code !== 0) throw new Error(data.message || '服务异常');
        full = data.data?.choices?.[0]?.message?.content || '';
      }

      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isTyping: false } : m));
      if (full) {
        askedQuestionsRef.current = [...askedQuestionsRef.current, full];
        // 首次发言时先保存开场白
        if (!hasSavedOpeningRef.current) {
          hasSavedOpeningRef.current = true;
          const opening = messages.find(m => m.role === 'author');
          if (opening) saveMessage(sessionId, conversationIdRef.current, 'author', opening.content, undefined);
        }
        saveMessage(sessionId, conversationIdRef.current, 'author', full, undefined);
        // 有新消息，笔谈状态不强制重置，generateNote 内部会根据消息数判断是否需弹窗
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setError(e.message || '抛题失败');
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '（思绪中断，请稍后再试。）', isTyping: false } : m));
    } finally {
      abortRef.current = null;
      setIsAskingQuestion(false);
    }
  }, [isThinking, isAskingQuestion, messages, book.title, book.author, sessionId]);

  const doGenerateNote = useCallback(async () => {
    setShowRegenWarn(false);
    setIsGeneratingNote(true);
    setError('');
    try {
      const res = await fetch('/api/h5/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, bookTitle: book.title, conversationId: conversationIdRef.current, userId: userId || null }),
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || '生成失败');
      setNoteGenerated(true);
      noteMessageCountRef.current = messages.filter(m => !m.isTyping).length;
      setNoteToast('笔谈已生成，可在「太虚笔谈」中查阅 ✦');
      setTimeout(() => setNoteToast(''), 4000);
    } catch (e: any) {
      setError(e.message || '生成笔谈失败');
    } finally {
      setIsGeneratingNote(false);
    }
  }, [messages, sessionId, book.title, userId]);

  const generateNote = useCallback(() => {
    if (isGeneratingNote) return;
    const userMsgs = messages.filter(m => m.role === 'user' && !m.isTyping);
    if (userMsgs.length === 0) { setError('尚无对话内容，无法生成笔谈'); return; }
    // 已有笔谈且无新消息，提示是否重复生成
    const hasNewMsgs = messages.filter(m => !m.isTyping).length > noteMessageCountRef.current;
    if (noteGenerated && !hasNewMsgs) {
      setShowRegenWarn(true);
      return;
    }
    doGenerateNote();
  }, [isGeneratingNote, messages, noteGenerated, doGenerateNote]);

  const doNewChat = useCallback(async () => {
    setShowNewChatWarn(false);
    abortRef.current?.abort();
    await fetch(`/api/h5/chat-history/${encodeURIComponent(sessionId)}?conversationId=${encodeURIComponent(conversationIdRef.current)}`, { method: 'DELETE' }).catch(() => {});
    conversationIdRef.current = generateConversationId();
    isSendingRef.current = false;
    hasSavedOpeningRef.current = false;
    askedQuestionsRef.current = [];
    setNoteGenerated(false);
    setNoteToast('');
    setError('');
    const p = persona;
    let opening = `你好，我是${book.author}。你有什么想与我探讨的话题？`;
    if (p?.openingQuestion) {
      const lines = p.openingQuestion.split('\n').map((l: string) => l.trim()).filter(Boolean);
      if (lines.length > 0) opening = lines[Math.floor(Math.random() * lines.length)];
    }
    setMessages([{ id: `a_${Date.now()}`, role: 'author', content: opening, isTyping: false }]);
    setIsThinking(false);
  }, [sessionId, persona, book.author]);

  const handleNewChat = useCallback(() => {
    const userMsgs = messages.filter(m => m.role === 'user' && !m.isTyping);
    if (userMsgs.length > 0 && !noteGenerated) {
      setShowNewChatWarn(true);
    } else {
      doNewChat();
    }
  }, [messages, noteGenerated, doNewChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAtPicker) {
      const list = bookList.filter(b => !atSearch || b.title.includes(atSearch) || b.author.includes(atSearch)).slice(0, atSearch ? 20 : 5);
      if (e.key === 'ArrowDown') { e.preventDefault(); setPickerIndex(i => Math.min(i + 1, list.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPickerIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowAtPicker(false); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (list[pickerIndex]) { selectGuestBook(list[pickerIndex]); }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const authorInitial = book.author.slice(-1);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
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
        }}>灵魂对弈</div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: sc, fontSize: '0.88rem', letterSpacing: '2px' }}>{book.author}</div>
          <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '0.6rem', letterSpacing: '1px', marginTop: '1px' }}>{book.era}</div>
        </div>
      </div>

      {/* ===== 作者档案卡片 ===== */}
      {persona && showPersona && (
        <div style={{
          margin: '10px 14px 0', padding: '12px 14px',
          background: `linear-gradient(135deg, ${sc}14, rgba(0,0,0,0.4))`,
          border: `1px solid ${sc}28`, borderRadius: '12px',
          fontSize: '0.72rem', color: 'rgba(190,210,250,0.65)',
          lineHeight: '1.75', flexShrink: 0, position: 'relative',
        }}>
          <div style={{ color: sc, fontSize: '0.8rem', marginBottom: '6px', letterSpacing: '2px', textShadow: `0 0 8px ${sc}60` }}>
            {book.title} · 作者档案
          </div>
          <div style={{ marginBottom: '4px' }}>{persona.identity}</div>
          <div style={{ color: 'rgba(160,185,230,0.45)', fontSize: '0.68rem' }}>
            {persona.coreViews.slice(0, 2).join(' · ')}
          </div>
          <div onClick={() => setShowPersona(false)} style={{
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
        scrollbarWidth: 'thin',
        scrollbarColor: `${sc}30 transparent`,
      }}>
        {messages.map(msg => {
          const gc = msg.guestAuthor?.color || sc;
          // Compute user rank info for this message
          const SOUL_RANKS_SD = [
            { min: 0,     max: 20,    title: '初入书院', color: '#8ba5c8', icon: '📖' },
            { min: 21,    max: 100,   title: '初窥门径', color: '#6dbfb8', icon: '🌿' },
            { min: 101,   max: 500,   title: '渐入佳境', color: '#7cb87f', icon: '🌱' },
            { min: 501,   max: 1000,  title: '融会贯通', color: '#c8a96e', icon: '✨' },
            { min: 1001,  max: 2000,  title: '博闻强识', color: '#d4836e', icon: '🔥' },
            { min: 2001,  max: 5000,  title: '通儒达道', color: '#a78bfa', icon: '💫' },
            { min: 5001,  max: 10000, title: '宗师境界', color: '#f472b6', icon: '🌟' },
            { min: 10001, max: Infinity, title: '太虚先贤', color: '#ffd700', icon: '☀️' },
          ];
          const userRankIdx = userScore !== undefined
            ? Math.max(0, SOUL_RANKS_SD.findIndex(r => userScore >= r.min && userScore <= r.max))
            : -1;
          const userRank = userRankIdx >= 0 ? SOUL_RANKS_SD[userRankIdx] : null;
          // SVG polygon frame — same shapes as profile tab, scaled to 46×46
          const scx = 23; const scy = 23;
          function sdPolyPt(angleDeg: number, r: number) {
            const a = (angleDeg - 90) * Math.PI / 180;
            return `${(scx + r * Math.cos(a)).toFixed(1)},${(scy + r * Math.sin(a)).toFixed(1)}`;
          }
          const sdRankShapes: (() => string)[] = [
            () => [sdPolyPt(0,20), sdPolyPt(90,14), sdPolyPt(180,20), sdPolyPt(270,14)].join(' '),
            () => Array.from({length:5},(_,i)=>sdPolyPt(i*72,19)).join(' '),
            () => Array.from({length:6},(_,i)=>sdPolyPt(i*60,19)).join(' '),
            () => Array.from({length:8},(_,i)=>sdPolyPt(i*45, i%2===0?20:16)).join(' '),
            () => Array.from({length:16},(_,i)=>sdPolyPt(i*22.5, i%2===0?21:14)).join(' '),
            () => Array.from({length:24},(_,i)=>sdPolyPt(i*15, i%2===0?21:15)).join(' '),
            () => Array.from({length:32},(_,i)=>sdPolyPt(i*11.25, i%2===0?21:12)).join(' '),
            () => Array.from({length:48},(_,i)=>sdPolyPt(i*7.5, i%2===0?21:11)).join(' '),
          ];
          const sdPts = userRank ? (sdRankShapes[userRankIdx] ?? sdRankShapes[4])() : '';
          const sdGc2 = userRank
            ? SOUL_RANKS_SD[Math.min(userRankIdx + 1, SOUL_RANKS_SD.length - 1)].color
            : '#5c82d4';
          const sdSpikeCounts = [4,5,6,8,8,12,16,24];
          const sdSpikes = sdSpikeCounts[userRankIdx] ?? 8;

          return (
          <div key={msg.id} style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            flexDirection: msg.role === 'author' ? 'row' : 'row-reverse',
          }}>
            {/* 作者头像 */}
            {msg.role === 'author' && (
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: `radial-gradient(circle at 40% 35%, ${gc}70, ${gc}25)`,
                border: `1px solid ${gc}70`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fffbe8', fontSize: '0.9rem',
                boxShadow: `0 0 14px ${gc}50`,
              }}>
                {msg.guestAuthor ? msg.guestAuthor.name.slice(-1) : authorInitial}
              </div>
            )}
            {/* 用户头像（右侧，同段位多边形框） */}
            {msg.role === 'user' && (
              <div style={{ position: 'relative', flexShrink: 0, width: '46px', height: '46px' }}>
                {userRank ? (
                  <svg width="46" height="46" style={{ position: 'absolute', inset: 0 }}>
                    <defs>
                      <linearGradient id={`sdGrad${msg.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={userRank.color} stopOpacity="0.95" />
                        <stop offset="50%" stopColor={sdGc2} stopOpacity="0.7" />
                        <stop offset="100%" stopColor={userRank.color} stopOpacity="0.95" />
                      </linearGradient>
                      <filter id={`sdGlow${msg.id}`}>
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    <polygon points={sdPts} fill={`${userRank.color}15`} stroke="none" />
                    <polygon points={sdPts} fill="none" stroke={`url(#sdGrad${msg.id})`} strokeWidth="1.5" filter={`url(#sdGlow${msg.id})`} />
                    {Array.from({ length: sdSpikes }, (_, i) => {
                      const [x, y] = sdPolyPt(i * (360 / sdSpikes), 20).split(',').map(Number);
                      return <circle key={i} cx={x} cy={y} r={sdSpikes <= 6 ? 1.5 : sdSpikes <= 12 ? 1.2 : 0.9} fill={userRank.color} opacity="0.9" />;
                    })}
                  </svg>
                ) : null}
                {/* 头像圆 */}
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: userRank
                    ? `radial-gradient(circle at 40% 35%, ${userRank.color}55, rgba(10,20,60,0.9))`
                    : 'rgba(28,38,72,0.9)',
                  border: userRank ? `1px solid ${userRank.color}88` : '1px solid rgba(70,90,150,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#c8d8ff', fontSize: '0.8rem', fontWeight: 'bold',
                  boxShadow: userRank ? `0 0 10px ${userRank.color}44` : 'none',
                }}>
                  {userDisplayName ? userDisplayName.slice(0, 1).toUpperCase() : '我'}
                </div>
                {/* 段位图标徽章 */}
                {userRank && (
                  <div style={{
                    position: 'absolute', bottom: '1px', right: '1px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: '#000d26', border: `1px solid ${userRank.color}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '8px',
                  }}>{userRank.icon}</div>
                )}
              </div>
            )}
            {/* 气泡 */}
            <div style={{
              maxWidth: '72%',
            }}>
              {/* 用户段位标签（气泡上方） */}
              {msg.role === 'user' && userRank && (
                <div style={{
                  fontSize: '0.6rem', color: `${userRank.color}99`, letterSpacing: '1px',
                  marginBottom: '3px', textAlign: 'right', paddingRight: '2px',
                }}>{userRank.icon} {userRank.title}</div>
              )}
              {/* 访客作者标签 */}
              {msg.guestAuthor && (
                <div style={{
                  fontSize: '0.62rem', color: `${gc}99`, letterSpacing: '1px',
                  marginBottom: '4px', paddingLeft: '2px',
                }}>{msg.guestAuthor.name} <span style={{ opacity: 0.5 }}>· 《{msg.guestAuthor.title}》</span></div>
              )}
              <div style={{
                padding: '11px 15px',
                borderRadius: msg.role === 'author' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                background: msg.role === 'author'
                  ? `linear-gradient(135deg, ${gc}1a, rgba(8,14,42,0.85))`
                  : 'rgba(28,38,72,0.8)',
                border: msg.role === 'author'
                  ? `1px solid ${gc}38`
                  : '1px solid rgba(70,90,150,0.3)',
                color: msg.role === 'author' ? '#ddeeff' : 'rgba(195,210,240,0.85)',
                fontSize: '0.88rem', lineHeight: '1.8', letterSpacing: '0.5px',
                boxShadow: msg.role === 'author' ? `0 2px 18px ${gc}18` : 'none',
              }}>
                {msg.isTyping && !msg.content ? (
                  <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                        background: gc, opacity: 0.6,
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
          </div>
          );
        })}

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

      {/* ===== 操作按钮行 ===== */}
      <div style={{
        flexShrink: 0, padding: '6px 14px 0',
        background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(14px)',
        borderTop: `1px solid ${sc}20`,
        display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center',
      }}>
        {noteToast && (
          <span style={{
            flex: 1, color: `${sc}cc`, fontSize: '0.7rem', letterSpacing: '1px',
          }}>{noteToast}</span>
        )}
        <button
          onClick={handleNewChat}
          style={{
            padding: '5px 12px', borderRadius: '20px',
            background: 'rgba(30,45,80,0.5)', border: '1px solid rgba(80,110,180,0.3)',
            color: 'rgba(180,200,240,0.7)', fontSize: '0.68rem', cursor: 'pointer',
            letterSpacing: '1px', transition: 'all 0.2s', fontFamily: '"KaiTi","STKaiti",serif',
          }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(120,160,255,0.6)'; (e.target as HTMLElement).style.color = '#b0d0ff'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(80,110,180,0.3)'; (e.target as HTMLElement).style.color = 'rgba(180,200,240,0.7)'; }}
        >
          新建对话
        </button>
        <button
          onClick={askQuestion}
          disabled={isThinking || isAskingQuestion}
          style={{
            padding: '5px 12px', borderRadius: '20px',
            background: 'rgba(30,45,80,0.5)',
            border: `1px solid ${isThinking || isAskingQuestion ? 'rgba(60,80,140,0.25)' : sc + '40'}`,
            color: isThinking || isAskingQuestion ? 'rgba(150,170,210,0.3)' : `${sc}bb`,
            fontSize: '0.68rem',
            cursor: isThinking || isAskingQuestion ? 'not-allowed' : 'pointer',
            letterSpacing: '1px', transition: 'all 0.2s', fontFamily: '"KaiTi","STKaiti",serif',
          }}
        >
          {isAskingQuestion ? '思考中…' : '你问我答'}
        </button>
        <button
          onClick={generateNote}
          disabled={isGeneratingNote}
          style={{
            padding: '5px 12px', borderRadius: '20px',
            background: noteGenerated ? `${sc}18` : 'rgba(30,45,80,0.5)',
            border: `1px solid ${noteGenerated ? sc + '55' : 'rgba(80,110,180,0.3)'}`,
            color: noteGenerated ? `${sc}cc` : isGeneratingNote ? 'rgba(150,170,210,0.4)' : `${sc}99`,
            fontSize: '0.68rem',
            cursor: isGeneratingNote ? 'not-allowed' : 'pointer',
            letterSpacing: '1px', transition: 'all 0.2s', fontFamily: '"KaiTi","STKaiti",serif',
          }}
        >
          {isGeneratingNote ? '生成中…' : noteGenerated ? '✦ 已归档' : '生成笔谈'}
        </button>
      </div>

      {/* ===== 输入区域 ===== */}
      <div style={{
        flexShrink: 0, padding: '10px 14px 14px',
        background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(14px)',
        position: 'relative',
        display: 'flex', gap: '10px', alignItems: 'flex-end',
      }}>
        {/* @ 选书浮层 */}
        {showAtPicker && (
          <div style={{
            position: 'absolute', bottom: '100%', left: '14px', right: '58px',
            background: 'rgba(4,8,28,0.97)', border: `1px solid ${sc}30`,
            borderRadius: '10px', zIndex: 10, overflow: 'hidden',
            boxShadow: `0 -4px 24px rgba(0,0,0,0.5)`,
            marginBottom: '4px',
          }}>
            <div style={{
              padding: '7px 12px', fontSize: '0.62rem',
              color: `${sc}66`, borderBottom: `1px solid ${sc}15`,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>@ 邀请另一位作者参与探讨</span>
              <span style={{ opacity: 0.5 }}>↑↓ Enter Esc</span>
            </div>
            {pickerLoading && bookList.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: `${sc}50`, fontSize: '0.7rem' }}>加载中…</div>
            ) : (() => {
              const list = bookList.filter(b => !atSearch || b.title.includes(atSearch) || b.author.includes(atSearch)).slice(0, atSearch ? 20 : 5);
              return list.length === 0 ? (
                <div style={{ padding: '14px', textAlign: 'center', color: 'rgba(150,170,210,0.3)', fontSize: '0.7rem' }}>
                  {atSearch ? `未找到「${atSearch}」相关书籍` : '暂无其他灵魂档案'}
                </div>
              ) : list.map((b, i) => (
                <div
                  key={b.id}
                  onClick={() => selectGuestBook(b)}
                  onMouseEnter={() => setPickerIndex(i)}
                  style={{
                    padding: '9px 14px', cursor: 'pointer',
                    background: i === pickerIndex ? `${b.soulColor}18` : 'transparent',
                    borderBottom: i < list.length - 1 ? `1px solid ${sc}0d` : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  <div>
                    <span style={{ color: b.soulColor, fontSize: '0.8rem', letterSpacing: '1px' }}>《{b.title}》</span>
                    <span style={{ color: 'rgba(160,185,230,0.5)', fontSize: '0.68rem', marginLeft: '8px' }}>{b.author}{b.era ? ` · ${b.era}` : ''}</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* 访客作者标签 */}
          {guestAuthor && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '0.68rem',
            }}>
              <span style={{
                background: `${guestAuthor.color}18`, border: `1px solid ${guestAuthor.color}40`,
                borderRadius: '12px', padding: '2px 10px',
                color: `${guestAuthor.color}cc`, letterSpacing: '1px',
              }}>📎 正在邀请 {guestAuthor.author} <span style={{ opacity: 0.6 }}>·《{guestAuthor.title}》</span></span>
              <span
                onClick={() => { setGuestAuthor(null); setInput(prev => prev.replace(/@《[^》]+》\s*/g, '')); }}
                style={{ cursor: 'pointer', color: 'rgba(150,170,210,0.4)', fontSize: '0.7rem', padding: '2px 4px' }}
              >✕</span>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={guestAuthor ? `向${guestAuthor.author}提问… (Enter 发送)` : `向${book.author}表达你的观点… (Enter 发送，Shift+Enter 换行)`}
            rows={2}
            style={{
              flex: 1, background: 'rgba(12,22,52,0.75)',
              border: `1px solid ${guestAuthor ? guestAuthor.color + '55' : sc + '30'}`, borderRadius: '12px',
              padding: '10px 14px', color: '#c8deff',
              fontSize: '0.88rem', outline: 'none', resize: 'none',
              lineHeight: '1.6', letterSpacing: '0.5px', caretColor: guestAuthor ? guestAuthor.color : sc,
              fontFamily: '"KaiTi", "STKaiti", serif',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => {
              e.target.style.borderColor = `${guestAuthor ? guestAuthor.color : sc}55`;
              e.target.style.boxShadow = `0 0 14px ${guestAuthor ? guestAuthor.color : sc}20`;
            }}
            onBlur={e => {
              e.target.style.borderColor = `${guestAuthor ? guestAuthor.color : sc}30`;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isThinking}
          style={{
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: !input.trim() || isThinking
              ? 'rgba(30,45,80,0.6)'
              : `linear-gradient(135deg, ${guestAuthor ? guestAuthor.color + 'dd' : sc + 'dd'}, ${guestAuthor ? guestAuthor.color + '99' : sc + '99'})`,
            color: !input.trim() || isThinking ? 'rgba(120,150,200,0.35)' : '#fff',
            fontSize: '1.1rem', cursor: !input.trim() || isThinking ? 'not-allowed' : 'pointer',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: !input.trim() || isThinking ? 'none' : `0 0 18px ${guestAuthor ? guestAuthor.color + '55' : sc + '55'}`,
          }}
        >↑</button>
      </div>

      {/* ===== 新建对话确认弹窗 ===== */}
      {/* ===== 重复生成笔谈确认 ===== */}
      {showRegenWarn && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(0,4,16,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(8,14,42,0.98), rgba(4,8,28,0.98))',
            border: `1px solid ${sc}30`, borderRadius: '16px',
            padding: '28px 24px', maxWidth: '320px', width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>📜</div>
            <div style={{ color: sc, fontSize: '0.95rem', letterSpacing: '3px', marginBottom: '12px' }}>
              已有归档笔谈
            </div>
            <div style={{
              color: 'rgba(170,190,230,0.6)', fontSize: '0.76rem', lineHeight: '1.8',
              marginBottom: '24px', letterSpacing: '0.5px',
            }}>
              本次对话已生成过笔谈，重复生成将覆盖原有记录。确认重新生成？
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowRegenWarn(false)}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: 'rgba(20,30,60,0.5)', border: '1px solid rgba(60,80,140,0.3)',
                  color: 'rgba(130,155,200,0.55)', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                }}
              >取消</button>
              <button
                onClick={doGenerateNote}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: `linear-gradient(135deg, ${sc}cc, ${sc}88)`,
                  border: 'none',
                  color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                  boxShadow: `0 0 14px ${sc}44`,
                }}
              >重新生成</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 重复生成笔谈确认 ===== */}
      {showRegenWarn && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(0,4,16,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(8,14,42,0.98), rgba(4,8,28,0.98))',
            border: `1px solid ${sc}30`, borderRadius: '16px',
            padding: '28px 24px', maxWidth: '320px', width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>📜</div>
            <div style={{ color: sc, fontSize: '0.95rem', letterSpacing: '3px', marginBottom: '12px' }}>
              已有归档笔谈
            </div>
            <div style={{
              color: 'rgba(170,190,230,0.6)', fontSize: '0.76rem', lineHeight: '1.8',
              marginBottom: '24px', letterSpacing: '0.5px',
            }}>
              本次对话已生成过笔谈。重新生成将覆盖原有记录，确认继续？
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowRegenWarn(false)}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: 'rgba(20,30,60,0.5)', border: '1px solid rgba(60,80,140,0.3)',
                  color: 'rgba(130,155,200,0.55)', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                }}
              >取消</button>
              <button
                onClick={doGenerateNote}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: `linear-gradient(135deg, ${sc}cc, ${sc}88)`,
                  border: 'none', color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                  boxShadow: `0 0 14px ${sc}44`,
                }}
              >重新生成</button>
            </div>
          </div>
        </div>
      )}

      {showNewChatWarn && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(0,4,16,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(8,14,42,0.98), rgba(4,8,28,0.98))',
            border: `1px solid ${sc}30`, borderRadius: '16px',
            padding: '28px 24px', maxWidth: '320px', width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>📜</div>
            <div style={{ color: sc, fontSize: '0.95rem', letterSpacing: '3px', marginBottom: '12px' }}>
              尚有未归档的对话
            </div>
            <div style={{
              color: 'rgba(170,190,230,0.6)', fontSize: '0.76rem', lineHeight: '1.8',
              marginBottom: '24px', letterSpacing: '0.5px',
            }}>
              本次对话尚未生成笔谈，新建对话后将无法记录此次思想交流。是否先生成笔谈再开始？
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={doNewChat}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: 'rgba(30,45,80,0.6)', border: '1px solid rgba(80,110,180,0.4)',
                  color: 'rgba(160,185,230,0.7)', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                }}
              >直接新建</button>
              <button
                onClick={() => { setShowNewChatWarn(false); generateNote(); }}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: `linear-gradient(135deg, ${sc}cc, ${sc}88)`,
                  border: 'none',
                  color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                  boxShadow: `0 0 14px ${sc}44`,
                }}
              >先生成笔谈</button>
              <button
                onClick={() => setShowNewChatWarn(false)}
                style={{
                  padding: '8px 18px', borderRadius: '20px',
                  background: 'rgba(20,30,60,0.5)', border: '1px solid rgba(60,80,140,0.3)',
                  color: 'rgba(130,155,200,0.55)', fontSize: '0.75rem', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: '"KaiTi","STKaiti",serif',
                }}
              >取消</button>
            </div>
          </div>
        </div>
      )}

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

export default SoulDialog;
