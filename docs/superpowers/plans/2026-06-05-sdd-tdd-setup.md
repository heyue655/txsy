# Plan: SDD+TDD 基础设施搭建

**日期**: 2026-06-05  
**状态**: 已完成 ✅

---

## 目标

将太虚书院项目改造为 SDD+TDD 开发模式，建立完整的文档规范体系和自动化测试基础设施，使后续功能开发能够遵循"先文档、先测试、再实现"的工作流。

---

## 任务清单

### 1. SDD 文档体系 ✅

- [x] 创建 `docs/current/` 权威规格文档目录
- [x] 创建 `docs/current/Index.md` 文档索引
- [x] 创建 `docs/current/architecture.md` 系统架构文档
- [x] 创建 `docs/current/api.md` API 接口规范
- [x] 创建 `docs/current/features/auth.md` 用户认证功能规格
- [x] 创建 `docs/current/features/soul-dialog.md` 灵魂对话功能规格
- [x] 创建 `docs/current/features/books.md` 书籍管理功能规格
- [x] 创建 `docs/superpowers/Index.md` 工程历史索引
- [x] 创建 `CLAUDE.md` AI Agent 工作流指令文件

### 2. 前端测试基础设施 ✅

- [x] 安装 `vitest@2.1.9` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom@24`
- [x] 创建 `vitest.config.ts`（jsdom 环境，setupFiles 配置）
- [x] 创建 `src/test/setup.ts`（`@testing-library/jest-dom` 注册）
- [x] 更新 `package.json` 添加 `test`/`test:ui`/`test:coverage` 脚本
- [x] 创建 `src/__tests__/LoginModal.test.tsx`（16 个测试，全部通过）

### 3. 后端测试基础设施 ✅

- [x] 安装 `vitest@4.1.8` + `supertest` + `@types/supertest`
- [x] 创建 `server/vitest.config.ts`（Node 环境）
- [x] 更新 `server/package.json` 添加测试脚本
- [x] 修改 `server/src/index.ts`：导出 `{app, prisma}`，添加 `VITEST` 守卫
- [x] 创建 `server/src/__tests__/auth.test.ts`（11 个测试，全部通过）
- [x] 创建 `server/src/__tests__/books.test.ts`（5 个测试，全部通过）

---

## 关键决策记录

| 决策 | 原因 |
|------|------|
| 前端使用 `vitest@2.1.9` 而非 latest | npmmirror 上 latest=v4.1.8 缺少 `dist/cli.js`，不稳定 |
| 后端使用真实 MySQL 集成测试 | 项目无 mock 层，集成测试更真实；测试数据用 `test_vitest_` 前缀标识 |
| 测试后 `prisma.$disconnect()` 仅在文件级 `afterAll` 调用一次 | 多个 describe 各自 disconnect 会导致后续测试报错 |
| 测试用户名限制在 20 字符内 | API 限制 `username.length <= 20`，超长会导致注册静默失败 |

---

## 测试覆盖范围

### 前端（src/__tests__/LoginModal.test.tsx）

- 登录表单渲染
- 登录成功/失败/网络异常
- 注册成功/失败
- 表单切换（登录↔注册）
- 邀请码自动填充
- API 端点正确性

### 后端（server/src/__tests__/）

**auth.test.ts**:
- 注册：正常注册、携带昵称、用户名过短、密码过短、非法字符、用户名重复、缺少用户名
- 登录：正确凭据、错误密码、不存在的用户、缺少密码

**books.test.ts**:
- 书籍列表接口：返回格式、isActive 过滤、按 sortOrder 排序、无活跃书籍返回空数组、健康检查

---

## 已知限制

- 前端 `vitest.config.ts` 有 TypeScript 类型警告（vite 版本不兼容），但不影响测试运行
- `App.tsx` 存在 8 个预存在的 LSP 错误，与本次改造无关
