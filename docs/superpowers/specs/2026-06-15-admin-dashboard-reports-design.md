# Admin 后台首页改版 + 数据报表 - 设计规范

**日期**: 2026-06-15  
**状态**: 已批准

---

## 背景与目标

当前 admin 后台首页（数据概览页）仅展示书籍总数、灵魂配置数量和大模型状态，缺少用户相关统计与数据报表。本次改版目标：

1. 在首页增加用户统计卡片（累计用户数、当日新增用户数）
2. 新增"数据报表"页面，可视化展示近期运营指标趋势

---

## 变更范围

| 模块 | 文件 | 变更类型 |
|------|------|----------|
| 后端 | `server/src/index.ts` | 新增 2 个统计 API |
| 后端路由 | `server/src/routes/adminStats.ts` | 新建文件 |
| Admin 前端 | `server/admin/index.html` | 改造 Dashboard + 新增 Reports 页 |

---

## 后端设计

### API 1: `GET /api/admin/stats/dashboard`

返回首页概览统计数据。

**响应**:
```json
{
  "code": 0,
  "data": {
    "totalUsers": 128,
    "todayNewUsers": 5,
    "todayActiveUsers": 23,
    "todayMessages": 156,
    "totalMessages": 8923
  }
}
```

**计算逻辑**:
- `totalUsers`: `SELECT COUNT(*) FROM users`
- `todayNewUsers`: `SELECT COUNT(*) FROM users WHERE DATE(createdAt) = CURDATE()`
- `todayActiveUsers`: 当天在 `chat_messages` 表中有记录的独立 `userId` 数量（包括 `user_{id}` 格式和访客 fingerprint，排除 null）
- `todayMessages`: `SELECT COUNT(*) FROM chat_messages WHERE DATE(createdAt) = CURDATE() AND role = 'user'`
- `totalMessages`: `SELECT COUNT(*) FROM chat_messages WHERE role = 'user'`

### API 2: `GET /api/admin/stats/report`

返回按日期分组的报表数据，用于图表渲染。

**查询参数**:
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `days` | number | 30 | 快捷天数选项（7/30/90），与 startDate/endDate 二选一 |
| `startDate` | string | - | 自定义起始日期，格式 YYYY-MM-DD |
| `endDate` | string | - | 自定义结束日期，格式 YYYY-MM-DD |

**响应**:
```json
{
  "code": 0,
  "data": {
    "dates": ["2026-05-16", "2026-05-17", ...],
    "newUsers": [3, 5, ...],
    "activeUsers": [12, 18, ...],
    "messages": [45, 67, ...]
  }
}
```

**计算逻辑**:
- `newUsers`: 按日期 GROUP BY `createdAt` 的注册用户数（来自 `users` 表）
- `activeUsers`: 按日期 GROUP BY，统计 `chat_messages` 中独立 `userId`（非 null）的数量
- `messages`: 按日期 GROUP BY，统计 `chat_messages` 中 `role='user'` 的消息数
- 日期序列由后端生成（确保无数据的日期也填充 0，不出现断档）

**实现方式**: 使用 Prisma `$queryRaw` 执行原生 SQL 进行日期聚合，MySQL `DATE()` 函数提取日期。

---

## 前端设计

### 1. 侧边栏改动

在现有导航项「数据概览」之后，「书籍管理」之前，添加：
```
📈 数据报表
```

### 2. 首页（数据概览）改造

原有 3 个统计卡片（书籍总数、灵魂配置、大模型状态）保留。

**在其后新增一行 2 个卡片**:
- 「累计用户数」- 展示 `totalUsers`，次级展示「较昨日 +N」（可选）
- 「今日新增用户」- 展示 `todayNewUsers`

展示风格与现有卡片一致（深色背景、primary 色数字、副标签文字）。

### 3. 数据报表页（新增）

**布局结构**:
```
[标题: 📈 数据报表]
[时间选择器区域]
  [近7天] [近30天] [近90天]  自定义: [开始日期] ~ [结束日期] [查询]
[图表区域 - 纵向排列三个图]
  [图表1: 每日新增用户数 - 折线图]
  [图表2: 每日活跃用户数 - 折线图]
  [图表3: 每日对话次数 - 柱状图]
```

**图表配置** (ECharts):
- 颜色主题跟随 admin 暗色风格（背景 `#0a0e1a`，图表背景 `#111827`）
- 折线图使用渐变填充（area chart）
- 柱状图使用主题色 `#3b82f6`
- X 轴: 日期标签（密集时自动旋转45°）
- 悬浮 tooltip 展示具体数值
- 图表高度: 280px，响应式宽度

**时间选择器交互**:
- 快捷按钮互斥选中（高亮激活状态）
- 选择快捷项后立即刷新报表
- 自定义日期时需点击「查询」按钮
- 默认选中「近30天」

**ECharts 引入方式**: CDN
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

---

## 数据定义

| 指标 | 数据来源 | 计算说明 |
|------|----------|----------|
| 累计用户数 | `users` 表 | 所有已注册用户总数 |
| 今日新增用户 | `users` 表 | 当天 `createdAt` 的用户数 |
| 日活用户数 | `chat_messages` 表 | 当天有发言的独立 userId（含访客 fingerprint，排除 null） |
| 每日对话次数 | `chat_messages` 表 | 当天 `role='user'` 的消息数（仅计用户侧发言） |

---

## 非功能要求

- 报表 API 响应时间 < 1s（MySQL 聚合查询，无需缓存）
- 时间范围最大支持 180 天（防止查询过慢）
- 后端不新增数据库表，全部利用现有 `users` 和 `chat_messages` 表
- admin 后台无鉴权（与现有行为一致）
