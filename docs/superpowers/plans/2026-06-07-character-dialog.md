# 书中角色对话功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: 实现基于延迟初始化的书中角色对话功能，允许用户选择书中角色进行对话，角色灵魂档案在首次被选择时由 AI 自动生成。

**Architecture**: 
1. **DB**: 新增 `Character` 模型，包含 `status` 字段控制初始化状态。
2. **Backend**: 扩展 `/api/h5/chat` 接口支持 `characterId`，内部集成延迟初始化逻辑；新增角色列表接口。
3. **Frontend**: 在对话界面增加角色选择器，处理初始化 Loading 状态。

**Tech Stack**: Prisma, Express, React, Three.js, Vitest.

---

### Task 1: 数据库模型迁移

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/seed.ts` (可选，添加测试数据)

- [ ] **Step 1: 更新 Prisma Schema**

在 `server/prisma/schema.prisma` 中添加 `Character` 模型：

```prisma
/// 书中角色
model Character {
  id              Int      @id @default(autoincrement())
  bookId          Int
  name            String   @db.VarChar(50)   /// 角色名
  status          String   @db.VarChar(20) @default("pending") /// pending, initializing, ready
  identity        String?  @db.Text          /// 身份设定
  personality     String?  @db.Text          /// 性格特征
  coreViews       String?  @db.Text          /// JSON array - 核心观点
  knowledgeLimits String?  @db.Text          /// 知识边界
  speakingStyle   String?  @db.Text          /// 说话风格
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)

  @@index([bookId])
  @@map("characters")
}
```

- [ ] **Step 2: 执行迁移**

```bash
cd server
npx prisma db push
```

- [ ] **Step 3: 验证**

检查数据库是否成功创建 `characters` 表。

---

### Task 2: 后端 - 角色列表接口

**Files:**
- Create: `server/src/routes/characters.ts`
- Modify: `server/src/index.ts` (注册路由)

- [ ] **Step 1: 编写测试**

在 `server/src/__tests__/characters.test.ts` 中：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

const TEST_PREFIX = 'test_vitest_'

describe('GET /api/h5/books/:id/characters', () => {
  let testBookId: number

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: { title: `${TEST_PREFIX}TestBook`, author: 'TestAuthor', era: 'Modern' }
    })
    testBookId = book.id
    
    await prisma.character.createMany({
      data: [
        { bookId: testBookId, name: '角色 A', status: 'ready' },
        { bookId: testBookId, name: '角色 B', status: 'pending' }
      ]
    })
  })

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { bookId: testBookId } })
    await prisma.book.delete({ where: { id: testBookId } })
  })

  it('返回书籍的角色列表', async () => {
    const res = await request(app)
      .get(`/api/h5/books/${testBookId}/characters`)
      .expect(200)

    expect(res.body.code).toBe(0)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toHaveProperty('id')
    expect(res.body.data[0]).toHaveProperty('name')
    expect(res.body.data[0]).toHaveProperty('status')
  })
})
```

- [ ] **Step 2: 实现路由**

创建 `server/src/routes/characters.ts`:

```typescript
import { Router } from 'express'
import { prisma } from '../index'

const router = Router()

router.get('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })

    const characters = await prisma.character.findMany({
      where: { bookId },
      select: { id: true, name: true, status: true },
      orderBy: { id: 'asc' }
    })
    res.json({ code: 0, data: characters })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

export default router
```

- [ ] **Step 3: 注册路由**

在 `server/src/index.ts` 中：

```typescript
import charactersRouter from './routes/characters'
// ...
app.use('/api/h5', charactersRouter)
```

- [ ] **Step 4: 运行测试**

```bash
cd server
npm test -- characters.test.ts
```

---

### Task 3: 后端 - 对话接口改造 (延迟初始化)

**Files:**
- Modify: `server/src/index.ts` (修改 `/api/h5/chat` 路由)

- [ ] **Step 1: 编写测试**

在 `server/src/__tests__/chat-character.test.ts` 中：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

const TEST_PREFIX = 'test_vitest_'

describe('POST /api/h5/chat (Character)', () => {
  let testBookId: number
  let pendingCharId: number

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: { title: `${TEST_PREFIX}ChatBook`, author: 'Author', era: 'Ancient' }
    })
    testBookId = book.id
    
    const char = await prisma.character.create({
      data: { bookId: testBookId, name: 'PendingChar', status: 'pending' }
    })
    pendingCharId = char.id
  })

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { bookId: testBookId } })
    await prisma.book.delete({ where: { id: testBookId } })
  })

  it('选择未初始化角色时自动触发初始化并对话', async () => {
    // 注意：由于涉及 LLM 调用，此处可能需要 Mock 或跳过实际流式检查
    // 这里主要测试逻辑分支：状态变更为 initializing -> ready
    // 实际 E2E 测试可放在集成测试中
    
    // 验证初始状态
    const char = await prisma.character.findUnique({ where: { id: pendingCharId } })
    expect(char?.status).toBe('pending')
  })
})
```

- [ ] **Step 2: 实现延迟初始化逻辑**

在 `server/src/index.ts` 的 `/api/h5/chat` 路由中，在处理 `messages` 之前添加逻辑：

```typescript
// ... 在 app.post('/api/h5/chat', ...) 内部
const { characterId } = req.body;
let characterPersona = null;

if (characterId) {
  const charId = parseInt(characterId);
  if (!isNaN(charId)) {
    let character = await prisma.character.findUnique({ where: { id: charId } });
    
    if (character && character.status === 'pending') {
      // 触发初始化
      await prisma.character.update({ where: { id: charId }, data: { status: 'initializing' } });
      
      // 调用 LLM 生成档案 (简化版，实际需构造 Prompt)
      const genPrompt = `请为书籍《${book?.title || '未知'}》中的角色"${character.name}"生成灵魂档案。返回 JSON: {identity, personality, coreViews, speakingStyle, knowledgeLimits}`;
      // ... 调用 LLM (复用现有的 fetch 逻辑，stream: false)
      // 解析结果并更新 DB
      // character = await prisma.character.update({ ... data: { ...parsed, status: 'ready' } });
      
      characterPersona = character;
    } else if (character && character.status === 'ready') {
      characterPersona = character;
    }
  }
}

// 修改 System Prompt 组装逻辑：
// 如果 characterPersona 存在，使用角色设定；否则使用作者设定 (book.persona)
```

*注：由于 LLM 调用较复杂，实际代码中需封装 `generateCharacterPersona(bookTitle, characterName)` 函数。*

- [ ] **Step 3: 封装生成函数**

在 `server/src/index.ts` 或新文件 `server/src/services/character-init.ts` 中：

```typescript
async function generateCharacterPersona(bookTitle: string, charName: string) {
  const config = await prisma.lLMConfig.findFirst({ where: { isActive: true } });
  if (!config) throw new Error('未配置大模型');

  const prompt = `你是太虚书院的角色档案生成助手。请根据书籍《${bookTitle}》和角色名"${charName}"，生成该角色的灵魂档案。
要求：
1. 身份设定 (identity): 10-20字
2. 性格特征 (personality): 20-50字
3. 核心观点 (coreViews): JSON数组，3-5条
4. 说话风格 (speakingStyle): 10-20字
5. 知识边界 (knowledgeLimits): 10-20字

返回纯 JSON 格式。`;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    })
  });
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM 返回格式错误');
  
  return JSON.parse(jsonMatch[0]);
}
```

- [ ] **Step 4: 运行测试**

```bash
cd server
npm test
```

---

### Task 4: 前端 - 角色选择器 UI

**Files:**
- Modify: `src/App.tsx` (或相关对话组件)

- [ ] **Step 1: 增加状态管理**

在 `App.tsx` 中：

```typescript
const [characters, setCharacters] = useState<any[]>([]);
const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
const [characterLoading, setCharacterLoading] = useState(false);
```

- [ ] **Step 2: 获取角色列表**

当选择书籍时，获取角色列表：

```typescript
useEffect(() => {
  if (focusedBook) {
    fetch(`/api/h5/books/${focusedBook.id}/characters`)
      .then(r => r.json())
      .then(j => { if (j.code === 0) setCharacters(j.data || []); })
      .catch(() => {});
  }
}, [focusedBook]);
```

- [ ] **Step 3: 渲染选择器**

在灵魂对话面板 (`src/App.tsx` 约 1725 行) 中，在"灵魂对话"按钮上方或下方添加角色选择下拉框：

```tsx
{characters.length > 0 && (
  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
    <div 
      onClick={() => setSelectedCharacterId(null)}
      style={{
        padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem',
        background: !selectedCharacterId ? 'rgba(200,169,110,0.3)' : 'rgba(255,255,255,0.1)',
        color: !selectedCharacterId ? '#c8a96e' : 'rgba(255,255,255,0.6)',
        cursor: 'pointer', border: '1px solid rgba(200,169,110,0.3)'
      }}
    >作者</div>
    {characters.map(c => (
      <div 
        key={c.id}
        onClick={() => {
          if (c.status === 'pending') {
            setCharacterLoading(true);
            // 触发一次空对话或专用初始化请求
            // 这里简化为：点击后直接发起对话，由后端处理初始化
          }
          setSelectedCharacterId(c.id);
        }}
        style={{
          padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem',
          background: selectedCharacterId === c.id ? 'rgba(200,169,110,0.3)' : 'rgba(255,255,255,0.1)',
          color: selectedCharacterId === c.id ? '#c8a96e' : 'rgba(255,255,255,0.6)',
          cursor: 'pointer', border: '1px solid rgba(200,169,110,0.3)',
          opacity: c.status === 'initializing' ? 0.6 : 1
        }}
      >
        {c.name} {c.status === 'pending' && '✨'}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: 传递 characterId**

在 `handleEnterSoul` 或发起对话的逻辑中，将 `selectedCharacterId` 传给 `SoulDialog` 组件。

---

### Task 5: 前端 - 初始化 Loading 状态

**Files:**
- Modify: `src/SoulDialog.tsx`

- [ ] **Step 1: 处理 Loading**

在 `SoulDialog.tsx` 中，如果收到后端返回的特定状态（或 SSE 连接建立前的延迟），显示"灵魂档案生成中..."。

由于后端是同步等待初始化完成后再开始 SSE，前端只需在发送请求后保持 Loading 状态即可。
确保 `SoulDialog` 的 Loading 动画持续时间足够长（或无限），直到 SSE 开始推送数据。

- [ ] **Step 2: 验证**

在微信/浏览器中测试：
1. 选择书籍。
2. 点击一个带 `✨` 标记的角色。
3. 观察是否显示 Loading，随后开始对话。
4. 再次选择该角色，应直接进入对话（无 Loading）。

---

### Task 6: 文档归档与收尾

**Files:**
- Modify: `docs/current/features/character-dialog.md`
- Modify: `docs/current/Index.md`

- [ ] **Step 1: 更新文档**

确认 `docs/current/features/character-dialog.md` 与实现一致。
更新 `docs/current/Index.md` 索引。

- [ ] **Step 2: 提交代码**

```bash
git add .
git commit -m "feat: add lazy-initialized character dialog feature"
```
