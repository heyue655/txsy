# 角色 @ 召唤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在作者对话中通过 @ 召唤本书角色，实现群聊式多角色共同讨论，同时在对话头部提供角色面板。

**Architecture:** 复用现有 guest-author @ 机制，新增 `mentionedCharacterId` 后端参数分支；SoulDialog 头部加角色图标 → 角色面板；@ picker 顶部新增"本书角色"分组。书籍卡片上的角色选择器 chips 移除，改由面板内"独立对话"快捷入口触发。

**Tech Stack:** React 19, TypeScript strict, Express, Prisma, Vitest + Supertest

---

## File Map

| File | 变更类型 | 内容 |
|------|---------|------|
| `server/src/routes/characters.ts` | Modify | `/books/:id/characters` 返回 `identity` 字段 |
| `server/src/index.ts` | Modify | `/api/h5/chat` 新增 `mentionedCharacterId` 分支 |
| `server/src/__tests__/characters.test.ts` | Modify | 新增 `mentionedCharacterId` 后端测试 |
| `src/App.tsx` | Modify | 移除角色选择器 chips，新增 `handleOpenCharacterDialog`，透传 prop |
| `src/SoulDialog.tsx` | Modify | 新增 prop、state、picker 扩展、panel UI、tag UI、消息渲染修复 |

---

## Task 1: 后端 — characters 列表接口返回 `identity`

**Files:**
- Modify: `server/src/routes/characters.ts:13`

- [ ] **Step 1: 修改 select，加入 `identity`**

```typescript
// server/src/routes/characters.ts — 第 11-15 行替换为：
const characters = await prisma.character.findMany({
  where: { bookId },
  select: { id: true, name: true, status: true, identity: true },
  orderBy: { id: 'asc' }
})
```

- [ ] **Step 2: 验证接口**

```bash
curl http://localhost:3003/api/h5/books/1/characters | jq '.'
# 预期：每条记录含 id, name, status, identity 字段
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/characters.ts
git commit -m "feat: include identity in character list API"
```

---

## Task 2: 后端 — `/api/h5/chat` 新增 `mentionedCharacterId` 分支

**Files:**
- Modify: `server/src/index.ts:112` (req.body 解构) + 新增处理分支

- [ ] **Step 1: 扩展 req.body 解构（index.ts 第 112 行）**

```typescript
const { messages, bookId, bookTitle, sessionId, guestBookTitle, guestBookId,
        characterId, mentionedCharacterId } = req.body;
```

- [ ] **Step 2: 在 `characterId` 分支之前（第 124 行前）插入 `mentionedCharacterId` 处理**

在 `// 处理角色选择与延迟初始化` 注释前，插入以下代码块：

```typescript
// 处理 @提及本书角色（群聊模式）
let mentionedChar: any = null;
if (mentionedCharacterId && !characterId) {
  const cId = parseInt(mentionedCharacterId);
  if (!isNaN(cId)) {
    let char = await prisma.character.findUnique({ where: { id: cId } });
    if (char && char.status === 'pending') {
      await prisma.character.update({ where: { id: cId }, data: { status: 'initializing' } });
      try {
        const persona = await generateCharacterPersona(bookTitle || char.name, char.name);
        char = await prisma.character.update({ where: { id: cId }, data: { ...persona, status: 'ready' } });
      } catch (e: any) {
        console.error('Character @mention init failed:', e.message);
        await prisma.character.update({ where: { id: cId }, data: { status: 'pending' } }).catch(() => {});
        throw e;
      }
    }
    mentionedChar = char;
  }
}
```

- [ ] **Step 3: 在 `// 角色对话处理` if (activeCharacter) 块之后（第 176 行之后），加入 mentionedChar 分支**

在 `if (activeCharacter) { ... }` 块结尾的 `} else if (book) {` 之前插入：

```typescript
} else if (mentionedChar) {
  let coreViews: string[] = [];
  try { coreViews = JSON.parse(mentionedChar.coreViews || '[]'); } catch { coreViews = []; }
  systemPrompt = `你是${mentionedChar.name}，${mentionedChar.identity || '书中角色'}。
你的灵魂档案如下：
性格特征：${mentionedChar.personality || '未知'}
核心观点：${coreViews.join('；')}
知识边界：${mentionedChar.knowledgeLimits || '未知'}
说话风格：${mentionedChar.speakingStyle || '未知'}

你被读者在与《${bookTitle || '本书'}》的对话中@提及，正在以旁观者角度加入这场讨论。
规则：
- 始终以第一人称作为${mentionedChar.name}回答，保持角色身份。
- 结合当前对话的语境发表你的观点或感受。
- 回答控制在 20~300 字以内。`;
```

- [ ] **Step 4: 重启后端服务，手动验证**

```bash
# 在 server/ 目录执行
npm run dev
# 用 curl 测试（替换为真实角色ID）
curl -X POST http://localhost:3003/api/h5/chat \
  -H "Content-Type: application/json" \
  -d '{"bookTitle":"红楼梦","sessionId":"test","messages":[{"role":"user","content":"你好"}],"mentionedCharacterId":5}' \
  --no-buffer
# 预期：返回 SSE 流或 JSON，内容以角色身份回复
```

- [ ] **Step 5: 写后端测试**

在 `server/src/__tests__/characters.test.ts` 末尾追加：

```typescript
describe('POST /api/h5/chat with mentionedCharacterId', () => {
  let testBookId: number;
  let testCharId: number;

  beforeAll(async () => {
    // 创建测试书籍和角色（status ready，直接跳过初始化）
    const book = await prisma.book.create({
      data: { title: 'test_vitest_mention_book', author: '测试作者', era: '测试', soulColor: '#fff' }
    });
    testBookId = book.id;
    const char = await prisma.character.create({
      data: {
        bookId: testBookId,
        name: 'test_vitest_mention_char',
        status: 'ready',
        identity: '测试角色',
        personality: '沉稳',
        coreViews: '["测试观点"]',
        knowledgeLimits: '书内知识',
        speakingStyle: '文言',
      }
    });
    testCharId = char.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: 'test_vitest_mention' } } });
    await prisma.book.deleteMany({ where: { title: { startsWith: 'test_vitest_mention' } } });
  });

  it('accepts mentionedCharacterId and returns a response', async () => {
    const res = await request(app)
      .post('/api/h5/chat')
      .send({
        bookTitle: 'test_vitest_mention_book',
        sessionId: 'test_vitest_mention_sess',
        messages: [{ role: 'user', content: '你好' }],
        mentionedCharacterId: testCharId,
      });
    // LLM 可能不可用，只验证不返回 400
    expect([200, 500]).toContain(res.status);
    if (res.status === 400) {
      // 不应该因为参数问题返回 400
      throw new Error(`Unexpected 400: ${JSON.stringify(res.body)}`);
    }
  });
});
```

- [ ] **Step 6: 运行测试**

```bash
# server/ 目录
npm test -- characters
# 预期：已有 characters 测试通过，新增测试通过（或因 LLM 不可用返回 500，但不返回 400）
```

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts server/src/__tests__/characters.test.ts
git commit -m "feat: add mentionedCharacterId branch to /api/h5/chat"
```

---

## Task 3: App.tsx — 移除角色选择器 + 新增 `handleOpenCharacterDialog`

**Files:**
- Modify: `src/App.tsx:1779-1813` (角色选择器), `:1174-1184` (handleEnterSoul), `:2638-2654` (SoulDialog props)

- [ ] **Step 1: 移除角色选择器 chips 块（App.tsx 第 1779-1813 行）**

删除从 `{/* 角色选择器 */}` 到 `)}` 的整块，仅保留按钮行：

```tsx
{/* 按钮行 */}
<div style={{ marginTop: '2px' }}>
  <div
    onClick={handleEnterSoul}
    ...
  >灵魂对话</div>
```

即删除这段（第 1779-1813 行）：
```tsx
{/* 角色选择器 */}
{characters.length > 0 && (
  <div className="char-list-scroll" style={{ ... }}>
    <div onClick={() => setSelectedCharacterId(null)} ...>作者</div>
    {characters.map(c => (
      <div key={c.id} onClick={() => setSelectedCharacterId(c.id)} ...>
        {c.name} {c.status === 'pending' && '✨'}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: 清理 `handleEnterSoul` 中的角色捕获逻辑（第 1181-1183 行）**

```typescript
// 修改前
const handleEnterSoul = useCallback(() => {
  const target = focusedBook || soulBook;
  setSoulLoading(target);
  setSoulBook(null);
  setFocusedBookId(null);
  setPausedBookId(null);
  setDialogCharacterId(selectedCharacterId);
  const char = characters.find(c => c.id === selectedCharacterId);
  setDialogCharacterName(char?.name);
}, [focusedBook, soulBook, selectedCharacterId, characters]);

// 修改后（移除角色捕获，始终以作者模式进入）
const handleEnterSoul = useCallback(() => {
  const target = focusedBook || soulBook;
  setSoulLoading(target);
  setSoulBook(null);
  setFocusedBookId(null);
  setPausedBookId(null);
  setDialogCharacterId(null);
  setDialogCharacterName(undefined);
}, [focusedBook, soulBook]);
```

- [ ] **Step 3: 在 `handleSelectFromList` 附近（第 1203 行后）新增 `handleOpenCharacterDialog`**

```typescript
const handleOpenCharacterDialog = useCallback((charId: number, charName: string) => {
  const book = soulDialog; // 捕获当前书籍，soulDialog 即将关闭
  setDialogCharacterId(charId);
  setDialogCharacterName(charName);
  setSoulDialog(null);
  setSoulLoading(book);   // 触发 SoulLoading → handleEnterDialog → 新 SoulDialog
}, [soulDialog]);
```

- [ ] **Step 4: 给 `SoulDialog` 传入新 prop（第 2638-2654 行）**

```tsx
<SoulDialog
  book={soulDialog}
  onClose={handleCloseDialog}
  userId={currentUserId}
  guestId={authUser ? guestFingerprint : undefined}
  isGuest={!authUser}
  guestMsgCount={guestMsgCount}
  guestLimit={guestLimit}
  onGuestLimitReached={handleGuestLimitReached}
  onUserMessage={handleGuestMessage}
  userScore={profileStats?.totalScore}
  userDisplayName={authUser ? (authUser.nickname || authUser.username) : undefined}
  characterId={dialogCharacterId}
  characterName={dialogCharacterName}
  onOpenCharacterDialog={handleOpenCharacterDialog}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: remove character pre-selector, add handleOpenCharacterDialog"
```

---

## Task 4: SoulDialog — 新增 prop、`characters` 状态、`mentionedCharacter` 状态

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 扩展 `Props` interface（第 38-57 行内）**

在 Props interface 末尾加：
```typescript
/** Callback to open an independent character dialog */
onOpenCharacterDialog?: (charId: number, charName: string) => void;
```

- [ ] **Step 2: 更新组件参数解构（第 254 行）**

```typescript
const SoulDialog: React.FC<Props> = ({
  book, onClose, userId, guestId, isGuest, guestMsgCount = 0, guestLimit = 3,
  onGuestLimitReached, onUserMessage, userScore, userDisplayName,
  characterId, characterName, onOpenCharacterDialog
}) => {
```

- [ ] **Step 3: 在 `const [showAtPicker, ...]` 附近（第 288 行区域）新增三个 state**

```typescript
// 本书角色列表（用于面板和 @ picker）
const [characters, setCharacters] = useState<{ id: number; name: string; status: string; identity: string | null }[]>([]);
const [showCharacterPanel, setShowCharacterPanel] = useState(false);
// @ 提及本书角色（与 guestAuthor 互斥）
const [mentionedCharacter, setMentionedCharacter] = useState<{ id: number; name: string; status: string } | null>(null);
```

- [ ] **Step 4: 在 `useEffect([], [])` 区域（第 440 行附近）新增角色加载 effect**

```typescript
// 加载本书角色列表（用于面板和 @ picker）
useEffect(() => {
  fetch(`/api/h5/books/${book.id}/characters`)
    .then(r => r.json())
    .then(j => { if (j.code === 0) setCharacters(j.data || []); })
    .catch(() => {});
}, [book.id]);
```

- [ ] **Step 5: Commit**

```bash
git add src/SoulDialog.tsx
git commit -m "feat: add characters state and onOpenCharacterDialog prop to SoulDialog"
```

---

## Task 5: SoulDialog — 扩展 @ picker（本书角色分组）

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 更新 `handleInputChange` 的互斥 guard（第 619-627 行）**

```typescript
// 修改前
if (guestAuthor) {
// 修改后
if (guestAuthor || mentionedCharacter) {
```

- [ ] **Step 2: 新增 `selectCharacter` callback（在 `selectGuestBook` 之后，第 693 行后）**

```typescript
const selectCharacter = useCallback((c: { id: number; name: string; status: string }) => {
  const pos = atStartPosRef.current;
  if (pos < 0) return;
  setInput(prev => prev.slice(0, pos) + `@${c.name}` + prev.slice(pos + 1 + atSearch.length));
  setMentionedCharacter({ id: c.id, name: c.name, status: c.status });
  setShowAtPicker(false);
  setTimeout(() => inputRef.current?.focus(), 0);
}, [atSearch]);
```

- [ ] **Step 3: 更新键盘导航 Enter 逻辑（`handleKeyDown`，第 936-952 行）**

将 `if (list[pickerIndex]) { selectGuestBook(list[pickerIndex]); }` 替换为：

```typescript
if (e.key === 'Enter') {
  e.preventDefault();
  const filteredChars = characters.filter(c => !atSearch || c.name.includes(atSearch));
  const combinedLen = filteredChars.slice(0, atSearch ? 20 : 5).length;
  if (pickerIndex < combinedLen) {
    selectCharacter(filteredChars.slice(0, atSearch ? 20 : 5)[pickerIndex]);
  } else {
    const bookIdx = pickerIndex - combinedLen;
    const filteredBooks = bookList.filter(b => !atSearch || b.title.includes(atSearch) || b.author.includes(atSearch)).slice(0, atSearch ? 20 : 5);
    if (filteredBooks[bookIdx]) selectGuestBook(filteredBooks[bookIdx]);
  }
  return;
}
```

- [ ] **Step 4: 替换 @ picker 渲染（第 1307-1357 行）**

将整个 `{showAtPicker && ( ... )}` 块替换为：

```tsx
{/* @ 选书/角色浮层 */}
{showAtPicker && (() => {
  const filteredChars = characters.filter(c => !atSearch || c.name.includes(atSearch)).slice(0, atSearch ? 20 : 5);
  const filteredBooks = bookList.filter(b => !atSearch || b.title.includes(atSearch) || b.author.includes(atSearch)).slice(0, atSearch ? 20 : 5);
  const totalCount = filteredChars.length + filteredBooks.length;
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '14px', right: '58px',
      background: 'rgba(4,8,28,0.97)', border: `1px solid ${sc}30`,
      borderRadius: '10px', zIndex: 10, overflow: 'hidden',
      boxShadow: `0 -4px 24px rgba(0,0,0,0.5)`, marginBottom: '4px',
    }}>
      {/* 标题行 */}
      <div style={{ padding: '7px 12px', fontSize: '0.62rem', color: `${sc}66`, borderBottom: `1px solid ${sc}15`, display: 'flex', justifyContent: 'space-between' }}>
        <span>@ 邀请作者或角色参与探讨</span>
        <span style={{ opacity: 0.5 }}>↑↓ Enter Esc</span>
      </div>

      {/* 本书角色分组 */}
      {filteredChars.length > 0 && (
        <>
          <div style={{ padding: '5px 12px 2px', fontSize: '0.58rem', color: `${sc}55`, letterSpacing: '1px' }}>本书角色</div>
          {filteredChars.map((c, i) => (
            <div
              key={`char_${c.id}`}
              onClick={() => selectCharacter(c)}
              onMouseEnter={() => setPickerIndex(i)}
              style={{
                padding: '8px 14px', cursor: 'pointer',
                background: i === pickerIndex ? `${sc}18` : 'transparent',
                borderBottom: `1px solid ${sc}0d`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'background 0.15s',
              }}
            >
              <div>
                <span style={{ color: sc, fontSize: '0.8rem', letterSpacing: '1px' }}>{c.name}</span>
                {c.status === 'pending' && <span style={{ color: '#c8a96e', fontSize: '0.68rem', marginLeft: '4px' }}>✨</span>}
                <span style={{ color: 'rgba(160,185,230,0.45)', fontSize: '0.68rem', marginLeft: '8px' }}>
                  {c.status === 'pending' ? '未初始化' : (c.identity || '')}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* 其他书作者分组 */}
      {(filteredBooks.length > 0 || pickerLoading) && (
        <>
          {filteredChars.length > 0 && <div style={{ padding: '5px 12px 2px', fontSize: '0.58rem', color: 'rgba(160,185,230,0.4)', letterSpacing: '1px', borderTop: `1px solid ${sc}10` }}>其他书作者</div>}
          {pickerLoading && filteredBooks.length === 0 ? (
            <div style={{ padding: '14px', textAlign: 'center', color: `${sc}50`, fontSize: '0.7rem' }}>加载中…</div>
          ) : filteredBooks.map((b, i) => {
            const globalIdx = filteredChars.length + i;
            return (
              <div
                key={b.id}
                onClick={() => selectGuestBook(b)}
                onMouseEnter={() => setPickerIndex(globalIdx)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  background: globalIdx === pickerIndex ? `${b.soulColor}18` : 'transparent',
                  borderBottom: i < filteredBooks.length - 1 ? `1px solid ${sc}0d` : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <div>
                  {b.isSoulArchive
                    ? <span style={{ color: b.soulColor, fontSize: '0.8rem', letterSpacing: '1px' }}>{b.author}</span>
                    : <span style={{ color: b.soulColor, fontSize: '0.8rem', letterSpacing: '1px' }}>《{b.title}》</span>}
                  <span style={{ color: 'rgba(160,185,230,0.5)', fontSize: '0.68rem', marginLeft: '8px' }}>{b.isSoulArchive ? '' : `${b.author} · `}{b.era}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* 空状态 */}
      {totalCount === 0 && !pickerLoading && (
        <div style={{ padding: '14px', textAlign: 'center', color: 'rgba(150,170,210,0.3)', fontSize: '0.7rem' }}>
          {atSearch ? `未找到「${atSearch}」相关角色或书籍` : '暂无可邀请的角色或书籍'}
        </div>
      )}
    </div>
  );
})()}
```

- [ ] **Step 5: Commit**

```bash
git add src/SoulDialog.tsx
git commit -m "feat: extend @ picker with book characters section"
```

---

## Task 6: SoulDialog — `streamChatAsMentionedCharacter` + `sendMessage` + history building

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 在 `streamChatAsGuest` 之后（第 617 行后）新增 `streamChatAsMentionedCharacter`**

```typescript
const streamChatAsMentionedCharacter = useCallback(async (
  charId: number,
  charName: string,
  history: { role: string; content: string }[],
) => {
  const msgId = `a_${Date.now()}_mc`;
  const convId = conversationIdRef.current;
  setMessages(prev => [...prev, {
    id: msgId, role: 'author', content: '', isTyping: true,
    guestAuthor: { name: charName, color: '#c8a96e', title: '' },
  }]);

  const controller = new AbortController();
  abortRef.current = controller;
  let full = '';

  try {
    const resp = await fetch('/api/h5/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookTitle: book.title,
        sessionId,
        messages: history,
        mentionedCharacterId: charId,
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
      saveMessage(sessionId, convId, 'guest', full, userId, { speakerName: charName });
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return;
    setError(e.message || '角色链接中断');
    setMessages(prev => prev.map(m => m.id === msgId
      ? { ...m, content: '（角色链接中断，请稍后再试。）', isTyping: false, isError: true }
      : m));
  } finally {
    abortRef.current = null;
  }
}, [book.title, sessionId, userId]);
```

- [ ] **Step 2: 更新 `sendMessage` — 捕获 `mentionedCharacter` 并清空（第 709-710 行区域）**

在 `const currentGuest = guestAuthor; setGuestAuthor(null);` 之后加：

```typescript
const currentMentioned = mentionedCharacter;
setMentionedCharacter(null);
```

- [ ] **Step 3: 更新 `sendMessage` 历史构建（第 733-738 行）— 处理角色消息标注**

```typescript
const history = [...messages, userMsg]
  .filter(m => !m.isTyping)
  .map(m => ({
    role: m.role === 'author' ? 'assistant' : 'user',
    content: m.guestAuthor
      ? (m.guestAuthor.title
        ? `[《${m.guestAuthor.title}》·${m.guestAuthor.name}说] ${m.content}`
        : `[${m.guestAuthor.name}说] ${m.content}`)
      : m.content,
  }));
```

- [ ] **Step 4: 更新 `sendMessage` 分支（第 741-744 行）**

```typescript
if (currentGuest) {
  await streamChatAsGuest(currentGuest.id, currentGuest.title, currentGuest.author, currentGuest.color, history);
} else if (currentMentioned) {
  await streamChatAsMentionedCharacter(currentMentioned.id, currentMentioned.name, history);
} else {
  await streamChat(history);
}
```

- [ ] **Step 5: 更新 `streamChat` / `streamChatAsGuest` 的 useCallback deps（确保 `mentionedCharacter` 不遗漏）**

`sendMessage` 的 deps 数组（第 750 行）加入 `streamChatAsMentionedCharacter`：

```typescript
}, [input, isThinking, messages, sessionId, streamChat, streamChatAsGuest,
    streamChatAsMentionedCharacter, guestAuthor, mentionedCharacter,
    userId, isGuest, guestMsgCount, guestLimit, onGuestLimitReached]);
```

- [ ] **Step 6: Commit**

```bash
git add src/SoulDialog.tsx
git commit -m "feat: add streamChatAsMentionedCharacter and update sendMessage"
```

---

## Task 7: SoulDialog — 角色面板 UI + 头部图标

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 在头部标题栏（第 980-983 行，关闭按钮之后）加入角色图标**

在 `<div onClick={onClose}>‹</div>` 之后插入：

```tsx
{/* 角色面板图标 */}
{characters.length > 0 && (
  <div
    onClick={() => setShowCharacterPanel(p => !p)}
    style={{
      cursor: 'pointer', flexShrink: 0, position: 'relative',
      color: showCharacterPanel ? sc : 'rgba(200,220,255,0.45)',
      fontSize: '1.1rem', padding: '4px 6px', lineHeight: 1,
      transition: 'color 0.2s',
    }}
    title="本书角色"
  >
    人
    <span style={{
      position: 'absolute', top: '0', right: '0',
      background: sc, color: '#000613', borderRadius: '50%',
      width: '14px', height: '14px', fontSize: '0.5rem', fontFamily: 'sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 'bold',
    }}>
      {characters.length > 9 ? '9+' : characters.length}
    </span>
  </div>
)}
```

- [ ] **Step 2: 在头部关闭标签 `</div>` 之后（第 992 行后）插入角色面板**

```tsx
{/* 角色面板关闭遮罩 */}
{showCharacterPanel && (
  <div
    onClick={() => setShowCharacterPanel(false)}
    style={{ position: 'fixed', inset: 0, zIndex: 4 }}
  />
)}

{/* 角色面板 */}
{showCharacterPanel && characters.length > 0 && (
  <div style={{
    position: 'absolute', top: '56px', left: 0, right: 0,
    background: 'rgba(2,6,22,0.97)', backdropFilter: 'blur(14px)',
    borderBottom: `1px solid ${sc}25`, zIndex: 5,
    maxHeight: '240px', overflowY: 'auto',
    padding: '6px 14px 10px',
    scrollbarWidth: 'thin', scrollbarColor: `${sc}30 transparent`,
  }}>
    <div style={{
      color: 'rgba(150,170,210,0.45)', fontSize: '0.6rem',
      letterSpacing: '2px', padding: '6px 0 8px',
    }}>
      本书角色 · {characters.length}位
    </div>
    {characters.map(c => (
      <div key={c.id} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 0', borderBottom: `1px solid rgba(255,255,255,0.04)`,
      }}>
        {/* 名字 + 状态 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: sc, fontSize: '0.85rem', letterSpacing: '1px' }}>{c.name}</span>
          {c.status === 'pending' && (
            <span style={{ color: '#c8a96e', fontSize: '0.65rem', marginLeft: '5px' }}>✨</span>
          )}
          <span style={{
            color: 'rgba(150,170,210,0.4)', fontSize: '0.65rem', marginLeft: '8px',
          }}>
            {c.status === 'pending' ? '未初始化' : (c.identity || '')}
          </span>
        </div>
        {/* @ 召唤 */}
        <div
          onClick={() => {
            const ta = inputRef.current;
            const pos = ta ? (ta.selectionStart ?? input.length) : input.length;
            setInput(prev => prev.slice(0, pos) + `@${c.name}` + prev.slice(pos));
            setMentionedCharacter({ id: c.id, name: c.name, status: c.status });
            setShowCharacterPanel(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          style={{
            flexShrink: 0, cursor: 'pointer', fontSize: '0.68rem',
            color: `${sc}cc`, border: `1px solid ${sc}35`,
            padding: '2px 8px', borderRadius: '10px',
            transition: 'all 0.2s',
          }}
        >@ 召唤</div>
        {/* 独立对话 */}
        <div
          onClick={() => {
            setShowCharacterPanel(false);
            onOpenCharacterDialog?.(c.id, c.name);
          }}
          style={{
            flexShrink: 0, cursor: 'pointer', fontSize: '0.68rem',
            color: 'rgba(200,220,255,0.45)', border: '1px solid rgba(100,130,200,0.25)',
            padding: '2px 8px', borderRadius: '10px',
            transition: 'all 0.2s',
          }}
        >独立对话</div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/SoulDialog.tsx
git commit -m "feat: add character panel UI and header icon to SoulDialog"
```

---

## Task 8: SoulDialog — 输入区角色标签 + 消息渲染修复

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 在输入区 `{/* 访客作者标签 */}` 块之后（第 1376 行后）新增角色标签**

在 `{guestAuthor && ( ... )}` 之后插入：

```tsx
{/* @ 召唤角色标签 */}
{mentionedCharacter && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem' }}>
    <span style={{
      background: 'rgba(200,169,110,0.15)', border: '1px solid rgba(200,169,110,0.4)',
      borderRadius: '12px', padding: '2px 10px',
      color: 'rgba(200,169,110,0.9)', letterSpacing: '1px',
    }}>
      📎 正在召唤 {mentionedCharacter.name}
      {mentionedCharacter.status === 'pending' && <span style={{ opacity: 0.6 }}> · 将自动初始化</span>}
    </span>
    <span
      onClick={() => {
        setMentionedCharacter(null);
        setInput(prev => prev.replace(new RegExp(`@${mentionedCharacter.name}\\s*`), ''));
      }}
      style={{ cursor: 'pointer', color: 'rgba(150,170,210,0.4)', fontSize: '0.7rem', padding: '2px 4px' }}
    >✕</span>
  </div>
)}
```

- [ ] **Step 2: 更新 textarea placeholder 和 border（第 1382/1386 行）— 兼容 `mentionedCharacter`**

```tsx
placeholder={
  guestAuthor ? `向${guestAuthor.author}提问… (Enter 发送)`
  : mentionedCharacter ? `问${mentionedCharacter.name}… (Enter 发送，Shift+Enter 换行)`
  : `向${displayName}表达你的观点… (Enter 发送，Shift+Enter 换行)`
}
// ...
border: `1px solid ${guestAuthor ? guestAuthor.color + '55' : mentionedCharacter ? 'rgba(200,169,110,0.5)' : sc + '30'}`,
// ...
caretColor: guestAuthor ? guestAuthor.color : mentionedCharacter ? '#c8a96e' : sc,
```

以及 onFocus/onBlur（第 1393-1399 行）：

```tsx
onFocus={e => {
  const borderColor = guestAuthor ? guestAuthor.color : mentionedCharacter ? '#c8a96e' : sc;
  e.target.style.borderColor = `${borderColor}55`;
  e.target.style.boxShadow = `0 0 14px ${borderColor}20`;
}}
onBlur={e => {
  const borderColor = guestAuthor ? guestAuthor.color : mentionedCharacter ? '#c8a96e' : sc;
  e.target.style.borderColor = `${borderColor}30`;
  e.target.style.boxShadow = 'none';
}}
```

- [ ] **Step 3: 修复消息气泡标签渲染（第 1165-1169 行）— 角色消息不显示空书名**

```tsx
{/* 访客作者 / 角色标签 */}
{msg.guestAuthor && (
  <div style={{
    fontSize: '0.62rem', color: `${gc}99`, letterSpacing: '1px',
    marginBottom: '4px', paddingLeft: '2px',
  }}>
    {msg.guestAuthor.name}
    {msg.guestAuthor.title && (
      <span style={{ opacity: 0.5 }}> · 《{msg.guestAuthor.title}》</span>
    )}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/SoulDialog.tsx
git commit -m "feat: add mentionedCharacter input tag and fix character message rendering"
```

---

## Task 9: 端到端验证

- [ ] **Step 1: 启动前后端**

```bash
# 终端 1（server/）
npm run dev
# 终端 2（根目录）
npm run dev -- --host
```

- [ ] **Step 2: 验证以下场景**

1. 打开书籍卡片 → 不再有角色 chips，只有"灵魂对话"按钮
2. 进入对话 → 头部出现"人"图标 + 数量徽章
3. 点击图标 → 角色面板展开，显示角色列表
4. 面板中点"@ 召唤 林黛玉" → 输入框插入 `@林黛玉`，出现金色标签
5. 发送消息 → 林黛玉的回复出现在对话流中，气泡显示"林黛玉"（无书名后缀）
6. 面板中点"独立对话" → 关闭当前对话，进入加载动画，再次进入以该角色为主的对话
7. 重新进入对话，历史中的角色消息正确渲染
8. @ 输入时，picker 顶部显示"本书角色"分组，下方显示"其他书作者"

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat: character @ mention group chat in SoulDialog"
```
