# Admin 后台首页改版 + 数据报表 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 admin 后台首页增加累计用户数/今日新增统计卡片，并新增数据报表页面（含 ECharts 折线图/柱状图展示每日注册、日活、对话次数）

**Architecture:** 后端新增 `adminStats` 路由（2 个接口：dashboard 概览统计 + report 报表数据），前端 admin 单页 HTML 引入 ECharts CDN，改造 Dashboard 页并新增 Reports 页。

**Tech Stack:** Node.js/Express/Prisma/$queryRaw (MySQL 聚合)，ECharts 5 (CDN)，原生 JS/HTML

---

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 创建 | `server/src/routes/adminStats.ts` |
| 创建 | `server/src/__tests__/adminStats.test.ts` |
| 修改 | `server/src/index.ts`（注册路由） |
| 修改 | `server/admin/index.html`（Dashboard + Reports 页） |

---

### Task 1: 创建 adminStats 路由

**Files:**
- Create: `server/src/routes/adminStats.ts`

- [ ] **Step 1: 创建路由文件**

创建 `server/src/routes/adminStats.ts`，内容如下：

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/** 将 Date 对象格式化为本地时区 YYYY-MM-DD 字符串 */
function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 生成从 startDate 到 endDate（含）的日期字符串数组 */
function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    dates.push(toLocalDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** 将原始查询返回的 date 字段统一转为 YYYY-MM-DD */
function normalizeDate(raw: Date | string): string {
  if (raw instanceof Date) return toLocalDateStr(raw);
  return String(raw).slice(0, 10);
}

// GET /api/admin/stats/dashboard — 首页概览统计
router.get('/dashboard', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalUsers, todayNewUsers, todayActiveResult, todayMessages, totalMessages] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
        // distinct userId（非 null）= 注册用户 + 访客 fingerprint 当天有发言
        prisma.chatMessage.groupBy({
          by: ['userId'],
          where: {
            createdAt: { gte: today, lt: tomorrow },
            userId: { not: null },
          },
        }),
        prisma.chatMessage.count({
          where: { createdAt: { gte: today, lt: tomorrow }, role: 'user' },
        }),
        prisma.chatMessage.count({ where: { role: 'user' } }),
      ]);

    res.json({
      code: 0,
      data: {
        totalUsers,
        todayNewUsers,
        todayActiveUsers: todayActiveResult.length,
        todayMessages,
        totalMessages,
      },
    });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// GET /api/admin/stats/report — 按日期分组的报表数据
// Query params: days=30 | startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/report', async (req, res) => {
  try {
    const { days, startDate, endDate } = req.query as {
      days?: string;
      startDate?: string;
      endDate?: string;
    };

    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ code: 1, message: '日期格式错误，请使用 YYYY-MM-DD' });
      }
    } else {
      const daysNum = Math.min(Math.max(parseInt(days || '30') || 30, 1), 180);
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - daysNum + 1);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const dates = generateDateRange(start, end);

    // 每日新增用户（users 表）
    const newUsersRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM users
      WHERE createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY DATE(createdAt)
    `;

    // 每日活跃用户（chat_messages 表，按 userId distinct）
    const activeUsersRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(DISTINCT userId) as count
      FROM chat_messages
      WHERE createdAt >= ${start} AND createdAt <= ${end} AND userId IS NOT NULL
      GROUP BY DATE(createdAt)
    `;

    // 每日对话次数（chat_messages 表，role='user'）
    const messagesRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM chat_messages
      WHERE createdAt >= ${start} AND createdAt <= ${end} AND role = 'user'
      GROUP BY DATE(createdAt)
    `;

    // 转换为 Map<dateStr, number>，便于填充空日期
    const toMap = (rows: Array<{ date: Date | string; count: bigint }>) => {
      const m = new Map<string, number>();
      for (const row of rows) m.set(normalizeDate(row.date), Number(row.count));
      return m;
    };

    const newUsersMap = toMap(newUsersRaw);
    const activeUsersMap = toMap(activeUsersRaw);
    const messagesMap = toMap(messagesRaw);

    res.json({
      code: 0,
      data: {
        dates,
        newUsers: dates.map(d => newUsersMap.get(d) ?? 0),
        activeUsers: dates.map(d => activeUsersMap.get(d) ?? 0),
        messages: dates.map(d => messagesMap.get(d) ?? 0),
      },
    });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

export default router;
```

- [ ] **Step 2: 在 index.ts 注册路由**

在 `server/src/index.ts` 中，找到其他路由 import 处，添加：

```typescript
import adminStatsRouter from './routes/adminStats';
```

在 `app.use('/api/admin', adminCharactersRouter);` 之后添加：

```typescript
app.use('/api/admin/stats', adminStatsRouter);
```

- [ ] **Step 3: 提交**

```bash
git add server/src/routes/adminStats.ts server/src/index.ts
git commit -m "feat: add admin stats API routes (dashboard + report)"
```

---

### Task 2: 编写后端测试

**Files:**
- Create: `server/src/__tests__/adminStats.test.ts`

- [ ] **Step 1: 创建测试文件**

创建 `server/src/__tests__/adminStats.test.ts`：

```typescript
import request from 'supertest';
import { app, prisma } from '../index';

const TEST_PREFIX = 'test_vitest_adminstats_';

async function cleanupTestData() {
  await prisma.chatMessage.deleteMany({
    where: { userId: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: TEST_PREFIX } },
  });
}

describe('Admin Stats APIs', () => {
  beforeAll(async () => { await cleanupTestData(); });
  afterAll(async () => { await cleanupTestData(); });

  describe('GET /api/admin/stats/dashboard', () => {
    it('返回正确的数据结构，所有字段均为 number', async () => {
      const res = await request(app).get('/api/admin/stats/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(typeof d.totalUsers).toBe('number');
      expect(typeof d.todayNewUsers).toBe('number');
      expect(typeof d.todayActiveUsers).toBe('number');
      expect(typeof d.todayMessages).toBe('number');
      expect(typeof d.totalMessages).toBe('number');
      expect(d.totalUsers).toBeGreaterThanOrEqual(0);
    });

    it('新注册用户后 totalUsers 和 todayNewUsers 各增 1', async () => {
      const before = (await request(app).get('/api/admin/stats/dashboard')).body.data;

      await prisma.user.create({
        data: { username: `${TEST_PREFIX}u1`, password: 'hash' },
      });

      const after = (await request(app).get('/api/admin/stats/dashboard')).body.data;
      expect(after.totalUsers).toBe(before.totalUsers + 1);
      expect(after.todayNewUsers).toBe(before.todayNewUsers + 1);
    });
  });

  describe('GET /api/admin/stats/report', () => {
    it('days=7 时返回长度为 7 的数组', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=7');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(d.dates.length).toBe(7);
      expect(d.newUsers.length).toBe(7);
      expect(d.activeUsers.length).toBe(7);
      expect(d.messages.length).toBe(7);
    });

    it('无参数时默认返回 30 天', async () => {
      const res = await request(app).get('/api/admin/stats/report');
      expect(res.body.data.dates.length).toBe(30);
    });

    it('自定义 startDate/endDate 返回正确的日期范围', async () => {
      const res = await request(app).get(
        '/api/admin/stats/report?startDate=2026-01-01&endDate=2026-01-10',
      );
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(d.dates.length).toBe(10);
      expect(d.dates[0]).toBe('2026-01-01');
      expect(d.dates[9]).toBe('2026-01-10');
    });

    it('各数组长度与 dates 一致', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=14');
      const d = res.body.data;
      expect(d.newUsers.length).toBe(d.dates.length);
      expect(d.activeUsers.length).toBe(d.dates.length);
      expect(d.messages.length).toBe(d.dates.length);
    });

    it('无效日期格式返回 400', async () => {
      const res = await request(app).get(
        '/api/admin/stats/report?startDate=not-a-date&endDate=also-not',
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('所有数值均为非负整数', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=7');
      const d = res.body.data;
      for (const v of [...d.newUsers, ...d.activeUsers, ...d.messages]) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
```

- [ ] **Step 2: 运行测试（预期全部通过）**

```bash
npm test -- adminStats
```

在 `server/` 目录下执行。预期输出：
```
✓ Admin Stats APIs > GET /api/admin/stats/dashboard > 返回正确的数据结构...
✓ Admin Stats APIs > GET /api/admin/stats/dashboard > 新注册用户后...
✓ Admin Stats APIs > GET /api/admin/stats/report > days=7 时返回长度为 7...
...
6 tests passed
```

- [ ] **Step 3: 提交**

```bash
git add server/src/__tests__/adminStats.test.ts
git commit -m "test: add admin stats API tests"
```

---

### Task 3: 改造 admin 前端 — Dashboard + Reports

**Files:**
- Modify: `server/admin/index.html`

这是改动量最大的一步，涉及：
1. 在 `<head>` 末尾添加 ECharts CDN
2. 侧边栏添加「数据报表」导航项
3. `render()` 增加 `reports` 分支
4. `renderDashboard()` 调用 stats API，增加 3 张新卡片
5. 新增 `renderReports()` 函数及图表逻辑

- [ ] **Step 1: 在 `<head>` 末尾（`</style>` 前一行）添加 ECharts CDN**

在 `</style>` 标签前插入：

```html
.report-filter { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:20px; }
.report-filter .btn-quick { padding:6px 14px; border:1px solid var(--border); border-radius:6px; background:var(--bg3); color:var(--text2); cursor:pointer; font-size:13px; transition:all 0.2s; }
.report-filter .btn-quick.active { background:var(--primary); border-color:var(--primary); color:#fff; }
.report-filter input[type=date] { padding:6px 10px; background:var(--bg3); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:13px; outline:none; }
.chart-card { background:var(--bg2); border:1px solid var(--border); border-radius:10px; margin-bottom:16px; padding:4px; }
```

在 `</head>` 前插入：

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

- [ ] **Step 2: 侧边栏添加「数据报表」导航**

找到：
```html
<a data-page="books"><span class="icon">📚</span>书籍管理</a>
```

在其前面插入：
```html
<a data-page="reports"><span class="icon">📈</span>数据报表</a>
```

- [ ] **Step 3: render() 添加 reports 分支**

找到：
```javascript
else if (currentPage === 'dean') await renderDean(c);
```

在其后添加：
```javascript
else if (currentPage === 'reports') await renderReports(c);
```

- [ ] **Step 4: 替换 renderDashboard 函数**

找到并完整替换 `renderDashboard` 函数（从 `async function renderDashboard(c) {` 到其闭合 `}` 的整段代码）：

```javascript
async function renderDashboard(c) {
  c.innerHTML = '<div class="empty" style="padding:60px 0;">⏳ 加载中…</div>';
  const [booksRes, llmRes, statsRes] = await Promise.all([
    api('/books'),
    api('/llm'),
    api('/admin/stats/dashboard'),
  ]);
  booksCache = booksRes.data || [];
  llmCache = llmRes.data || [];
  const personaCount = booksCache.filter(b => b.persona).length;
  const activeLlm = llmCache.find(l => l.isActive);
  const stats = statsRes.data || {};

  c.innerHTML = `
    <h2>📊 数据概览</h2>
    <div class="stats">
      <div class="stat-card">
        <div class="num">${booksCache.length}</div>
        <div class="label">书籍总数</div>
      </div>
      <div class="stat-card">
        <div class="num">${personaCount} / ${booksCache.length}</div>
        <div class="label">灵魂已配置</div>
      </div>
      <div class="stat-card">
        <div class="num" style="font-size:18px;">${activeLlm ? '✅ 已启用' : '❌ 未配置'}</div>
        <div class="label">大模型状态</div>
      </div>
    </div>
    <div class="stats" style="margin-top:0;">
      <div class="stat-card" style="border-color:rgba(59,130,246,0.35);">
        <div class="num" style="color:#60a5fa;">${stats.totalUsers ?? '—'}</div>
        <div class="label">累计注册用户</div>
      </div>
      <div class="stat-card" style="border-color:rgba(34,197,94,0.35);">
        <div class="num" style="color:#4ade80;">+${stats.todayNewUsers ?? 0}</div>
        <div class="label">今日新增用户</div>
      </div>
      <div class="stat-card" style="border-color:rgba(251,191,36,0.35);">
        <div class="num" style="color:var(--gold);">${stats.todayActiveUsers ?? '—'}</div>
        <div class="label">今日活跃用户</div>
      </div>
    </div>
    <h2 style="font-size:16px;margin-top:20px;">📚 最近书籍</h2>
    <table>
      <tr><th>书名</th><th>作者</th><th>年代</th><th>灵魂色</th><th>档案</th></tr>
      ${booksCache.slice(0, 10).map(b => `
        <tr>
          <td>${b.title}</td><td>${b.author}</td><td>${b.era}</td>
          <td><span class="color-dot" style="background:${b.soulColor}"></span>${b.soulColor}</td>
          <td><span class="badge ${b.persona ? 'badge-active' : 'badge-inactive'}">${b.persona ? '已配置' : '未配置'}</span></td>
        </tr>
      `).join('')}
    </table>
  `;
}
```

- [ ] **Step 5: 在文件末尾（`render()` 调用前）添加 renderReports 函数及相关逻辑**

在 `render();` 调用（文件末尾）之前，添加以下代码块：

```javascript
// ---- 数据报表 ----
let _reportCharts = [];

function _disposeReportCharts() {
  _reportCharts.forEach(c => { try { c.dispose(); } catch {} });
  _reportCharts = [];
}

async function renderReports(c) {
  _disposeReportCharts();
  c.innerHTML = `
    <h2>📈 数据报表</h2>
    <div class="report-filter">
      <button class="btn-quick active" data-days="7" onclick="switchReportDays(this, 7)">近7天</button>
      <button class="btn-quick" data-days="30" onclick="switchReportDays(this, 30)">近30天</button>
      <button class="btn-quick" data-days="90" onclick="switchReportDays(this, 90)">近90天</button>
      <span style="color:var(--text2);font-size:13px;margin-left:8px;">自定义：</span>
      <input type="date" id="r-start">
      <span style="color:var(--text2);">~</span>
      <input type="date" id="r-end">
      <button class="btn btn-primary btn-sm" onclick="queryCustomReport()">查询</button>
    </div>
    <div id="report-loading" style="display:none;text-align:center;padding:40px;color:var(--text2);">⏳ 加载中…</div>
    <div id="report-charts">
      <div class="chart-card"><div id="chart-newusers" style="height:280px;"></div></div>
      <div class="chart-card"><div id="chart-activeusers" style="height:280px;"></div></div>
      <div class="chart-card"><div id="chart-messages" style="height:280px;"></div></div>
    </div>
  `;

  // 设置自定义日期默认值（今天往前 7 天）
  const today = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
  document.getElementById('r-start').value = weekAgo.toISOString().slice(0, 10);
  document.getElementById('r-end').value = today.toISOString().slice(0, 10);

  await loadReportData({ days: 7 });
}

window.switchReportDays = async function(btn, days) {
  document.querySelectorAll('.report-filter .btn-quick').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await loadReportData({ days });
};

window.queryCustomReport = async function() {
  const startDate = document.getElementById('r-start')?.value;
  const endDate = document.getElementById('r-end')?.value;
  if (!startDate || !endDate) { toast('请选择起止日期', 'error'); return; }
  if (startDate > endDate) { toast('起始日期不能晚于结束日期', 'error'); return; }
  document.querySelectorAll('.report-filter .btn-quick').forEach(b => b.classList.remove('active'));
  await loadReportData({ startDate, endDate });
};

async function loadReportData({ days, startDate, endDate }) {
  const loading = document.getElementById('report-loading');
  const charts = document.getElementById('report-charts');
  if (loading) loading.style.display = 'block';
  if (charts) charts.style.opacity = '0.3';

  let url = '/admin/stats/report';
  if (startDate && endDate) {
    url += `?startDate=${startDate}&endDate=${endDate}`;
  } else {
    url += `?days=${days || 30}`;
  }

  let res;
  try {
    res = await api(url);
  } catch (e) {
    toast('加载报表失败: ' + e.message, 'error');
    if (loading) loading.style.display = 'none';
    if (charts) charts.style.opacity = '1';
    return;
  }

  if (loading) loading.style.display = 'none';
  if (charts) charts.style.opacity = '1';

  if (res.code !== 0) { toast('加载报表失败: ' + res.message, 'error'); return; }

  const { dates, newUsers, activeUsers, messages } = res.data;
  _disposeReportCharts();

  const rotateX = dates.length > 30 ? 45 : 0;

  const baseOpt = (title, color) => ({
    backgroundColor: 'transparent',
    title: { text: title, textStyle: { color: '#e5e7eb', fontSize: 14, fontWeight: 500 }, left: 16, top: 10 },
    grid: { left: 52, right: 20, top: 50, bottom: rotateX ? 55 : 36 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#9ca3af', fontSize: 11, rotate: rotateX, interval: dates.length > 60 ? 'auto' : 0 },
      axisLine: { lineStyle: { color: '#374151' } },
      axisTick: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1f2937', type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb', fontSize: 13 },
      formatter: (params) => {
        const p = params[0];
        return `${p.axisValue}<br/><span style="color:${color}">● </span>${p.seriesName}: <b>${p.value}</b>`;
      },
    },
  });

  const makeLineChart = (domId, title, data, color, seriesName) => {
    const el = document.getElementById(domId);
    if (!el) return;
    const ch = typeof echarts !== 'undefined' ? echarts.init(el) : null;
    if (!ch) return;
    ch.setOption({
      ...baseOpt(title, color),
      series: [{
        name: seriesName,
        type: 'line',
        data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        itemStyle: { color },
        lineStyle: { color, width: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '55' }, { offset: 1, color: color + '05' }] } },
      }],
    });
    _reportCharts.push(ch);
  };

  const makeBarChart = (domId, title, data, color, seriesName) => {
    const el = document.getElementById(domId);
    if (!el) return;
    const ch = typeof echarts !== 'undefined' ? echarts.init(el) : null;
    if (!ch) return;
    ch.setOption({
      ...baseOpt(title, color),
      series: [{
        name: seriesName,
        type: 'bar',
        data,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 32,
      }],
    });
    _reportCharts.push(ch);
  };

  makeLineChart('chart-newusers', '每日新增用户数', newUsers, '#3b82f6', '新增用户');
  makeLineChart('chart-activeusers', '每日活跃用户数', activeUsers, '#22c55e', '活跃用户');
  makeBarChart('chart-messages', '每日对话次数', messages, '#fbbf24', '对话次数');

  // 响应式：页面 resize 时重绘
  const resizeHandler = () => _reportCharts.forEach(c => c.resize());
  window.removeEventListener('resize', resizeHandler);
  window.addEventListener('resize', resizeHandler);
}
```

- [ ] **Step 6: 运行后端测试确认无回归**

在 `server/` 目录执行：
```bash
npm test
```

预期：adminStats 6 项通过，其他测试无新增失败。

- [ ] **Step 7: 手动验证前端**

启动后端：
```bash
npm run dev
```
（在 `server/` 目录）

打开 `http://localhost:3001/admin`，验证：
1. 首页概览多出「累计注册用户」「今日新增用户」「今日活跃用户」3 张卡片
2. 侧边栏出现「📈 数据报表」菜单
3. 进入数据报表页，图表正常渲染（ECharts）
4. 切换「近7天/近30天/近90天」可刷新图表数据
5. 自定义日期选择后点「查询」可刷新

- [ ] **Step 8: 提交**

```bash
git add server/admin/index.html
git commit -m "feat: redesign admin dashboard with user stats and add reports page with ECharts"
```

---

## 自检清单

- [x] spec 中所有需求均有对应任务覆盖
- [x] 无 TBD/TODO/占位符
- [x] 类型签名前后一致（`Date | string` 处理、`bigint → number` 转换）
- [x] 测试有具体断言，无模糊描述
- [x] 所有文件路径均为精确路径
