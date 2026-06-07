# 太虚书院 — AI Agent 工作流指令

> 本文件由项目团队维护，指导 AI Agent (Claude / OpenCode) 在本项目中的工作方式。
> **用户指令优先级高于本文件中的所有规则。**

---

## 项目概览

- **项目名称**: 太虚书院 (Taixu Academy)
- **类型**: 全栈 TypeScript Monorepo，移动端 H5 AI 阅读应用
- **前端**: React 19 + Three.js + Vite 8 (`src/`)
- **后端**: Node.js + Express + Prisma + MySQL (`server/`)
- **测试**: Vitest (前端 + 后端)
- **文档**: `docs/current/` (SDD 规格文档)

---

## SDD+TDD 工作流

### 新功能开发流程

```
1. 需求探索    → 使用 brainstorming 技能（创作前必须触发）
2. 架构设计    → 使用 rd-design-spec 技能（生成详细设计规范）
3. 需求文档    → 使用 write-prd 技能（生成 PRD / 用例文档）
4. 编写计划    → 使用 writing-plans 技能（保存到 docs/superpowers/plans/）
5. 先写测试    → 使用 test-driven-development 技能（TDD 红绿重构循环）
6. 实现代码    → 按计划逐步实现，确保测试通过
7. 代码审查    → 使用 requesting-code-review 技能
8. 文档归档    → 使用 releasing-design-docs 技能（更新 docs/current/）
9. 收尾提交    → 使用 finishing-work 技能
```

### Bug 修复流程

```
1. 复现问题    → 先写失败测试复现 Bug
2. 系统诊断    → 使用 systematic-debugging 技能
3. 修复实现    → 最小化变更，确保测试变绿
4. 回归验证    → 运行全量测试
```

---

## 技能 → 任务映射

| 你想做的事 | 使用技能 | 触发关键词 |
|-----------|----------|-----------|
| UI 设计与实现 | `ui-ux-pro-max` | "设计UI"、"做界面"、"实现组件" |
| 架构/技术设计 | `rd-design-spec` | "写详细设计"、"架构方案"、"技术设计" |
| 写 PRD/用例 | `write-prd` | "写PRD"、"写需求"、"用例文档" |
| 功能实现 | `brainstorming` → `writing-plans` → `test-driven-development` | "实现功能"、"开发..." |
| 修复 Bug | `systematic-debugging` | "报错"、"bug"、"测试失败" |
| 代码审查 | `requesting-code-review` | "审查代码"、"review" |
| 查找文档 | `/project-knowledge` | 了解项目现状 |
| 追溯历史 | `/engineering-history` | 了解某模块演进 |
| 收尾工作 | `finishing-work` | 会话结束前 |

---

## 项目规范

### TypeScript

- 使用 `strict: true`，不允许 `any`（必要时用 `unknown` + 类型断言）
- 后端使用 CommonJS (`module: commonjs`)，前端使用 ESModule
- 不使用 `namespace`，使用 ES modules

### 测试

- **前端**: `npm test` → Vitest + jsdom + React Testing Library
  - 测试文件位于 `src/__tests__/`
  - 命名规范: `ComponentName.test.tsx`
- **后端**: `npm test`（在 `server/` 目录执行）→ Vitest + Supertest
  - 测试文件位于 `server/src/__tests__/`
  - 命名规范: `feature.test.ts`
  - 集成测试使用真实 MySQL（需配置 `.env`）
  - 测试后自动清理测试数据（使用 `test_` 前缀用户名/数据）

### API 规范

- 响应统一格式: `{ code: 0, data: T }` | `{ code: 1, message: string }`
- 路径风格: `/api/h5/<resource>` (H5前台) | `/api/<resource>` (Admin)
- 遵循 `das-rest-skill` 规范（当涉及 API 设计时）

### 代码组织

- 不在 `server/src/index.ts` 中直接写业务逻辑，路由提取到 `routes/`
- Express app 实例从 `server/src/app.ts` 导出（解耦，便于测试）
- 前端组件保持单一职责，大组件提取 hooks

### 数据库

- 所有数据库操作通过 Prisma Client（不写原生 SQL）
- 新增字段需同步更新 `server/prisma/schema.prisma`，执行 `npm run db:push`
- 种子数据更新 `server/prisma/seed.ts`

---

## 目录结构速查

```
docs/current/          ← SDD 权威规格文档（使用 /project-knowledge 检索）
docs/superpowers/      ← 工程历史与计划文档
docs/superpowers/plans/ ← 功能实现计划（writing-plans 技能生成）
src/__tests__/         ← 前端测试
server/src/__tests__/  ← 后端测试
```

---

## 常用命令

```bash
# 前端
npm run dev            # 启动开发服务器
npm test               # 运行前端测试
npm run test:ui        # Vitest UI 可视化测试
npm run test:coverage  # 测试覆盖率报告
npm run build          # 构建前端

# 后端 (在 server/ 目录执行)
npm run dev            # 启动后端开发服务器
npm test               # 运行后端测试
npm run test:coverage  # 后端覆盖率报告
npm run db:push        # 同步数据库 schema
npm run db:seed        # 填充种子数据
npm run db:studio      # 打开 Prisma Studio
```
