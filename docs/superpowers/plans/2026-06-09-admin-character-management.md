# Admin Character Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "角色管理" page to the Admin panel so operators can list, create, delete, and reset characters per book—without needing Prisma Studio.

**Architecture:** New router file `server/src/routes/adminCharacters.ts` mounted at `/api/admin` provides four CRUD-style endpoints. The existing `server/admin/index.html` SPA gets a new sidebar entry and `renderCharacters` function; character management for each book opens in a modal. No schema changes needed.

**Tech Stack:** Express + Prisma (backend); Vanilla JS SPA in `server/admin/index.html` (frontend); Vitest + Supertest (tests).

---

### Task 1: Backend admin character routes (TDD)

**Files:**
- Create: `server/src/routes/adminCharacters.ts`
- Create: `server/src/__tests__/adminCharacters.test.ts`
- Modify: `server/src/index.ts` (add import + mount)

---

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/adminCharacters.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

const TEST_PREFIX = 'test_vitest_adminchar_'

describe('Admin Character Management APIs', () => {
  let testBookId: number
  let testCharId: number

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: {
        title: `${TEST_PREFIX}book`,
        author: `${TEST_PREFIX}author`,
        era: 'Test Era',
      }
    })
    testBookId = book.id
    const char = await prisma.character.create({
      data: { bookId: testBookId, name: `${TEST_PREFIX}char`, status: 'ready' }
    })
    testCharId = char.id
  })

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { bookId: testBookId } })
    await prisma.book.delete({ where: { id: testBookId } })
  })

  // GET /api/admin/books/:id/characters
  it('GET /api/admin/books/:id/characters 返回角色列表', async () => {
    const res = await request(app)
      .get(`/api/admin/books/${testBookId}/characters`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    const char = res.body.data.find((c: any) => c.id === testCharId)
    expect(char).toBeDefined()
    expect(char).toHaveProperty('name')
    expect(char).toHaveProperty('status')
  })

  // POST /api/admin/books/:id/characters
  it('POST /api/admin/books/:id/characters 创建新角色', async () => {
    const res = await request(app)
      .post(`/api/admin/books/${testBookId}/characters`)
      .send({ name: `${TEST_PREFIX}new_char` })
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data.name).toBe(`${TEST_PREFIX}new_char`)
    expect(res.body.data.status).toBe('pending')
    // cleanup
    await prisma.character.delete({ where: { id: res.body.data.id } })
  })

  it('POST /api/admin/books/:id/characters 空名称返回 400', async () => {
    const res = await request(app)
      .post(`/api/admin/books/${testBookId}/characters`)
      .send({ name: '   ' })
      .expect(400)
    expect(res.body.code).toBe(1)
  })

  // DELETE /api/admin/characters/:id
  it('DELETE /api/admin/characters/:id 删除角色', async () => {
    const temp = await prisma.character.create({
      data: { bookId: testBookId, name: `${TEST_PREFIX}delete_me`, status: 'pending' }
    })
    const res = await request(app)
      .delete(`/api/admin/characters/${temp.id}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    const gone = await prisma.character.findUnique({ where: { id: temp.id } })
    expect(gone).toBeNull()
  })

  it('DELETE /api/admin/characters/:id 不存在返回 404', async () => {
    const res = await request(app)
      .delete('/api/admin/characters/99999999')
      .expect(404)
    expect(res.body.code).toBe(1)
  })

  // POST /api/admin/characters/:id/regenerate
  it('POST /api/admin/characters/:id/regenerate 重置角色状态', async () => {
    // Give the char a non-pending status + some fields first
    await prisma.character.update({
      where: { id: testCharId },
      data: { status: 'ready', identity: '某角色', personality: '沉稳' }
    })
    const res = await request(app)
      .post(`/api/admin/characters/${testCharId}/regenerate`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.status).toBe('pending')
    expect(res.body.data.identity).toBeNull()
    expect(res.body.data.personality).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests – expect ALL to fail**

```bash
cd server && npx vitest run src/__tests__/adminCharacters.test.ts
```

Expected: all tests fail with 404 (routes don't exist yet).

- [ ] **Step 3: Create `server/src/routes/adminCharacters.ts`**

```typescript
import { Router } from 'express'
import { prisma } from '../index'

const router = Router()

// GET /api/admin/books/:id/characters
router.get('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })
    const characters = await prisma.character.findMany({
      where: { bookId },
      select: {
        id: true, name: true, status: true,
        identity: true, personality: true, coreViews: true,
        knowledgeLimits: true, speakingStyle: true,
      },
      orderBy: { id: 'asc' },
    })
    res.json({ code: 0, data: characters })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// POST /api/admin/books/:id/characters
router.post('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })
    const name = (req.body.name || '').trim()
    if (!name) return res.status(400).json({ code: 1, message: '角色名不能为空' })
    const character = await prisma.character.create({
      data: { bookId, name, status: 'pending' },
    })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// DELETE /api/admin/characters/:id
router.delete('/characters/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })
    const existing = await prisma.character.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ code: 1, message: '角色不存在' })
    await prisma.character.delete({ where: { id } })
    res.json({ code: 0, data: null })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// POST /api/admin/characters/:id/regenerate
router.post('/characters/:id/regenerate', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })
    const existing = await prisma.character.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ code: 1, message: '角色不存在' })
    const character = await prisma.character.update({
      where: { id },
      data: {
        status: 'pending',
        identity: null,
        personality: null,
        coreViews: null,
        knowledgeLimits: null,
        speakingStyle: null,
      },
    })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

export default router
```

- [ ] **Step 4: Mount the router in `server/src/index.ts`**

Add import after the existing `charactersRouter` import (line 10):

```typescript
import adminCharactersRouter from './routes/adminCharacters';
```

Add mount after the existing H5 characters mount (near line 978):

```typescript
app.use('/api/admin', adminCharactersRouter);
```

- [ ] **Step 5: Run tests – expect ALL to pass**

```bash
cd server && npx vitest run src/__tests__/adminCharacters.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/adminCharacters.ts server/src/__tests__/adminCharacters.test.ts server/src/index.ts
git commit -m "feat(admin): add character management REST APIs with tests"
```

---

### Task 2: Admin frontend character management page

**Files:**
- Modify: `server/admin/index.html`

**Changes summary:**
1. Add `👥 角色管理` nav item to sidebar
2. Add `characters` case to `render()` dispatch
3. Add `renderCharacters(c)` — shows paginated book list, each row with "管理角色" button
4. Add `showCharactersModal(bookId, bookTitle, charCount)` — modal listing characters for a book
5. Add `addCharacter(bookId, bookTitle)` — prompts for name, POSTs, refreshes modal
6. Add `deleteCharacter(charId, name, bookId, bookTitle)` — confirm + DELETE, refreshes modal
7. Add `regenerateCharacter(charId, name, bookId, bookTitle)` — confirm + POST regenerate, refreshes modal

---

- [ ] **Step 1: Add sidebar nav item**

In `server/admin/index.html`, find:
```html
      <a data-page="dean"><span class="icon">📜</span>院长配置</a>
```

Add after it:
```html
      <a data-page="characters"><span class="icon">👥</span>角色管理</a>
```

- [ ] **Step 2: Add `characters` case to `render()` dispatch**

Find in `server/admin/index.html`:
```javascript
  else if (currentPage === 'dean') await renderDean(c);
```

Add after it:
```javascript
  else if (currentPage === 'characters') await renderCharacters(c);
```

- [ ] **Step 3: Add character management functions before the `// 启动` comment**

In `server/admin/index.html`, find:
```javascript
// 启动
render();
```

Insert the following block immediately before that line:

```javascript
// ---- 角色管理 ----
async function renderCharacters(c) {
  const res = await api('/h5/books');
  const books = (res.data || [])
    .filter(b => { try { return !JSON.parse(b.categories || '[]').includes('灵魂档案'); } catch { return true; } })
    .sort((a, b) => a.id - b.id);

  // Fetch character counts for all books in parallel
  const countMap = {};
  await Promise.all(books.map(async b => {
    try {
      const r = await api(`/admin/books/${b.id}/characters`);
      countMap[b.id] = (r.data || []).length;
    } catch { countMap[b.id] = 0; }
  }));

  c.innerHTML = `
    <h2>👥 角色管理</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px;">为每本书配置书中角色，角色首次被 @ 时将自动生成灵魂档案。</p>
    <table>
      <tr><th>#</th><th>书名</th><th>作者</th><th>年代</th><th>角色数</th><th>操作</th></tr>
      ${books.length ? books.map(b => `
        <tr>
          <td>${b.id}</td>
          <td><strong>${b.title}</strong></td>
          <td>${b.author}</td>
          <td>${b.era}</td>
          <td><span style="color:var(--primary);font-weight:600;">${countMap[b.id] || 0}</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="showCharactersModal(${b.id}, '${b.title.replace(/'/g, "\\'")}')">管理角色</button>
          </td>
        </tr>
      `).join('') : '<tr><td colspan="6" class="empty">暂无书籍</td></tr>'}
    </table>
  `;
}

window.showCharactersModal = async function(bookId, bookTitle) {
  const res = await api(`/admin/books/${bookId}/characters`);
  const chars = res.data || [];

  // Remove any existing modal first
  document.getElementById('char-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'char-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:620px;max-height:80vh;">
      <h3>👥 ${bookTitle} · 角色管理</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="color:var(--text2);font-size:13px;">共 ${chars.length} 个角色</span>
        <button class="btn btn-primary btn-sm" onclick="addCharacter(${bookId}, '${bookTitle.replace(/'/g, "\\'")}')">+ 添加角色</button>
      </div>
      <table>
        <tr><th>#</th><th>角色名</th><th>状态</th><th>身份设定</th><th>操作</th></tr>
        ${chars.length ? chars.map(ch => `
          <tr>
            <td>${ch.id}</td>
            <td><strong>${ch.name}</strong></td>
            <td>${statusBadge(ch.status)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);">${ch.identity || '—'}</td>
            <td class="actions">
              <button class="btn btn-sm" style="background:var(--bg3);color:var(--gold);border:1px solid var(--border);"
                onclick="regenerateCharacter(${ch.id}, '${ch.name.replace(/'/g, "\\'")}', ${bookId}, '${bookTitle.replace(/'/g, "\\'")}')">重置</button>
              <button class="btn btn-danger btn-sm"
                onclick="deleteCharacter(${ch.id}, '${ch.name.replace(/'/g, "\\'")}', ${bookId}, '${bookTitle.replace(/'/g, "\\'")}')">删除</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="5" class="empty">暂无角色，点击「添加角色」</td></tr>'}
      </table>
      <div class="form-actions" style="margin-top:18px;">
        <button class="btn" onclick="document.getElementById('char-modal').remove()" style="background:var(--bg3);color:var(--text)">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
};

function statusBadge(status) {
  if (status === 'ready')        return '<span class="badge badge-active">✅ 就绪</span>';
  if (status === 'initializing') return '<span class="badge" style="background:rgba(251,191,36,0.15);color:var(--gold);">⏳ 初始化中</span>';
  return '<span class="badge badge-inactive">⚙️ 待初始化</span>';
}

window.addCharacter = async function(bookId, bookTitle) {
  const name = prompt('请输入角色名（将在首次 @ 时自动生成灵魂档案）：');
  if (!name?.trim()) return;
  const res = await api(`/admin/books/${bookId}/characters`, { method: 'POST', body: { name: name.trim() } });
  if (res.code !== 0) { toast('添加失败: ' + res.message, 'error'); return; }
  toast(`角色「${name.trim()}」已添加`);
  showCharactersModal(bookId, bookTitle);
};

window.deleteCharacter = async function(charId, charName, bookId, bookTitle) {
  if (!confirm(`确定删除角色「${charName}」？此操作不可撤销。`)) return;
  const res = await api(`/admin/characters/${charId}`, { method: 'DELETE' });
  if (res.code !== 0) { toast('删除失败: ' + res.message, 'error'); return; }
  toast(`角色「${charName}」已删除`);
  showCharactersModal(bookId, bookTitle);
};

window.regenerateCharacter = async function(charId, charName, bookId, bookTitle) {
  if (!confirm(`重置角色「${charName}」的灵魂档案？状态将变为"待初始化"，下次被 @ 时重新生成。`)) return;
  const res = await api(`/admin/characters/${charId}/regenerate`, { method: 'POST' });
  if (res.code !== 0) { toast('重置失败: ' + res.message, 'error'); return; }
  toast(`角色「${charName}」已重置，下次 @ 时重新生成`);
  showCharactersModal(bookId, bookTitle);
};
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3003/admin` (or the running admin port). Click "👥 角色管理" in the sidebar.

- Expected: Page loads, shows all books in a table with character counts and "管理角色" buttons.
- Click "管理角色" on any book → modal opens with character list.
- Click "+ 添加角色" → prompt appears, enter a name → new character appears with "待初始化" badge.
- Click "重置" → confirm → character resets to "待初始化" badge.
- Click "删除" → confirm → character removed from list.

- [ ] **Step 5: Run full backend test suite to ensure no regressions**

```bash
cd server && npx vitest run
```

Expected: All tests pass (including new adminCharacters suite).

- [ ] **Step 6: Commit**

```bash
git add server/admin/index.html
git commit -m "feat(admin): add character management page with CRUD UI"
```
