# 系统架构总览

## 项目概述

**太虚书院** (Taixu Academy) 是一款面向移动端的 AI 古典文学阅读应用，用户可在沉浸式 3D 星空场景中与中国古代文学大师的"灵魂"对话。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端渲染 | React 19 + TypeScript + Vite 8 |
| 3D 场景 | Three.js + @react-three/fiber + @react-three/drei |
| 后端框架 | Node.js + Express 4 + TypeScript |
| 数据库 ORM | Prisma 5 + MySQL |
| 认证 | JWT (jsonwebtoken) + bcryptjs |
| SSO | 自定义 SSO 单点登录 |
| AI 接入 | OpenAI 兼容 API（DeepSeek / Qwen / GPT）SSE 流式 |
| 容器化 | Docker 多阶段构建 + Docker Compose |

## 项目结构

```
project-root/
├── src/                    # 前端 React 源码
│   ├── App.tsx             # 主应用：3D 场景 + 全局状态 + 导航
│   ├── SoulDialog.tsx      # 灵魂对话组件（SSE 流式）
│   ├── DeanDialog.tsx      # 院长对话组件
│   ├── SoulLoading.tsx     # 召唤动画
│   ├── LoginModal.tsx      # 注册/登录弹窗
│   ├── config.js           # 可调视觉常量（星星数量等）
│   └── __tests__/          # 前端测试
├── server/
│   ├── src/
│   │   ├── index.ts        # Express 应用 + 所有 H5/Admin API 路由
│   │   ├── app.ts          # Express app 实例（解耦，便于测试）
│   │   └── routes/
│   │       ├── books.ts    # Admin 书籍 CRUD
│   │       ├── llm.ts      # Admin LLM 配置
│   │       └── persona.ts  # Admin 作者人格档案
│   ├── prisma/
│   │   ├── schema.prisma   # 数据库模型（9个表）
│   │   └── seed.ts         # 初始数据填充
│   └── __tests__/          # 后端测试
├── docs/
│   ├── current/            # 权威文档（SDD 设计规格）
│   └── superpowers/        # 工程历史（变更记录）
└── CLAUDE.md               # AI Agent 工作流指令
```

## 数据库模型

```
books          — 书籍表（标题、作者、朝代、颜色、分类）
author_personas — 作者灵魂档案（人格设定、核心观点、说话风格）
llm_configs    — 大模型配置（provider/endpoint/apiKey/model）
chat_messages  — 聊天记录（sessionId/conversationId/role/content）
note_entries   — 太虚笔谈（LLM生成的笔记、评分、精彩摘录）
users          — 注册用户（username/bcrypt hash/inviteCode）
invitations    — 邀请记录
app_configs    — 应用配置（key-value）
dean_configs   — 院长角色配置
```

## 核心数据流

```
用户点击星球 → App.tsx 打开 SoulDialog
→ SoulDialog 发送 POST /api/h5/chat
→ Express 查询 LLMConfig + Book + AuthorPersona
→ 构建 system prompt → 调用 LLM API（SSE）
→ 流式返回给前端 → 保存 ChatMessage
→ 对话结束后可生成 NoteEntry（太虚笔谈）
```

## 部署架构

```
[Mobile Browser]
      ↓ HTTPS
[Nginx / CDN]
      ↓
[Docker Container: txsy-app :3001]
  ├── Express static → dist/ (Vite 构建前端)
  ├── Express /admin → admin/index.html
  └── Express /api/* → 业务逻辑 + Prisma
      ↓
[MySQL Database]
```
