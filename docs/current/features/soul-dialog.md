# 灵魂对话功能规格

## 功能概述

用户在 3D 星空场景点击书籍星球，进入与该书作者"灵魂"的 SSE 流式 AI 对话界面。

## 核心流程

```
点击星球 → 召唤动画(SoulLoading) → 打开 SoulDialog
→ 用户输入消息 → POST /api/h5/chat
→ Express 构建 system prompt（基于 AuthorPersona）
→ 调用 LLM API（SSE 流式）
→ 流式文本实时展示 → 保存 ChatMessage
→ 对话结束可生成笔谈（NoteEntry）
```

## System Prompt 构建逻辑

```
你是《{书名}》的作者 {author}，{era}人。
[身份设定 identity]
[性格特征 personality]
[核心观点 coreViews]
[知识边界 knowledgeLimits]
[说话风格 speakingStyle]
```

## @提及功能（跨书对话）

用户可在对话中 `@《书名》` 引入其他作者参与讨论：
- 前端检测 `@《...》` 模式
- 发送时附带 `guestBookTitle` 参数
- 后端加载被引用者的 AuthorPersona 构建 guest system prompt
- 响应中 role 字段为 `guest`，speakerName 为被引用作者名

## 消息记录

| 字段 | 说明 |
|------|------|
| sessionId | 书名（去书名号），用于分组 |
| conversationId | 单次对话 UUID，用于区分同一书的多次对话 |
| role | `user` / `author` / `guest` |
| speakerName | guest 时为访客作者名 |

## 笔谈生成

对话结束后调用 `POST /api/h5/notes/generate`：
- 取最近 60 条消息
- LLM 生成：笔谈摘要 + 评分(1-5) + 各发言者观点摘录
- 摘录用于生成分享图片

## 测试用例

| 用例 | 期望 |
|------|------|
| 无 LLM 配置时请求 | 返回 400 "未配置大模型" |
| messages 参数缺失 | 返回 400 "messages 参数缺失" |
| 正常对话请求 | SSE 流式响应，包含 data: 事件 |
| @提及功能 | system prompt 包含 guestBook 的人格档案 |
