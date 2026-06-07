# API 接口规范

> 基础路径: `/api`
> 响应格式: `{ code: 0, data: T }` (成功) | `{ code: 1, message: string }` (失败)

## H5 前端接口

### 书籍

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/h5/books` | 获取激活书籍列表（含 persona） |

### LLM 配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/h5/llm-config` | 获取当前激活配置（apiKey 脱敏） |

### AI 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/h5/chat` | SSE 流式 AI 对话代理 |
| POST | `/api/h5/chat/save` | 保存对话消息到数据库 |
| GET | `/api/h5/chat/history` | 获取历史对话记录 |

### 太虚笔谈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/h5/notes/generate` | 生成笔谈（调用 LLM） |
| GET | `/api/h5/notes` | 获取笔谈列表 |
| DELETE | `/api/h5/notes/:id` | 删除笔谈 |
| GET | `/api/h5/notes/check/:sessionId` | 检查是否已有笔谈 |

### 用户认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/h5/auth/register` | 用户注册 |
| POST | `/api/h5/auth/login` | 用户登录 |
| GET | `/api/h5/auth/sso-callback` | SSO 单点登录回调 |

### 院长

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/h5/dean` | 获取院长信息 |
| POST | `/api/h5/dean/chat` | SSE 院长对话 |

## Admin 管理接口

### 书籍管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 书籍列表 |
| POST | `/api/books` | 创建书籍 |
| PUT | `/api/books/:id` | 更新书籍 |
| DELETE | `/api/books/:id` | 删除书籍 |

### LLM 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm` | 配置列表 |
| POST | `/api/llm` | 创建配置 |
| PUT | `/api/llm/:id` | 更新配置 |
| PUT | `/api/llm/:id/activate` | 激活配置 |

### 人格档案管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/persona/:bookId` | 获取人格档案 |
| PUT | `/api/persona/:bookId` | 更新人格档案 |

## 请求/响应示例

### POST /api/h5/auth/register

请求:
```json
{
  "username": "reader01",
  "password": "pass123",
  "nickname": "书院学子",
  "inviterCode": "ABC12345"
}
```

响应:
```json
{
  "code": 0,
  "data": {
    "token": "eyJhbG...",
    "user": {
      "id": 1,
      "username": "reader01",
      "nickname": "书院学子",
      "inviteCode": "XYZ98765"
    }
  }
}
```

### POST /api/h5/chat

请求:
```json
{
  "messages": [{ "role": "user", "content": "请谈谈您的仁政思想" }],
  "bookId": 1,
  "bookTitle": "《论语》",
  "sessionId": "论语"
}
```

响应: SSE 流式文本事件
```
data: {"content": "仁者，"}
data: {"content": "爱人也。"}
data: [DONE]
```
