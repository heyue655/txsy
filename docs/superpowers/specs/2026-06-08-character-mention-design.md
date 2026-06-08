# 角色 @ 召唤设计规范

**日期:** 2026-06-08  
**状态:** 已批准  
**范围:** SoulDialog 群聊模式 — 在作者对话中 @ 召唤本书角色

---

## 1. 背景与目标

现有角色对话功能以"进入前预选角色"为入口，启动独立 session，与作者对话完全割裂。  
目标：**在作者对话中直接 @ 召唤角色，实现群聊式多角色共同讨论**，同时保留独立角色对话的快捷入口。

---

## 2. 变更范围

### 移除
- `App.tsx` 书籍卡片上的角色选择器 chips（作者 / 林黛玉 / 贾宝玉 …）
- `handleEnterSoul` 里的 `selectedCharacterId` 捕获逻辑

### 保留不动
- `Character` 表 schema
- `generateCharacterPersona()` 懒初始化函数
- 现有 guest author（@其他书作者）系统
- `/api/h5/characters/:id`、`/api/h5/books/:id/characters` 接口
- 独立角色对话（通过角色面板快捷入口触发）

### 新增
| 位置 | 内容 |
|------|------|
| `SoulDialog.tsx` 头部 | 👥 人物图标，有角色时显示数量徽章，点击展开角色面板 |
| `SoulDialog.tsx` 角色面板 | 本书角色列表（name/status），@ 召唤 + 独立对话两个操作 |
| `SoulDialog.tsx` @ picker | 顶部新增"本书角色"分组，排在其他书之前 |
| `SoulDialog.tsx` | `mentionedCharacter` 状态 + `streamChatAsMentionedCharacter()` |
| `server/src/index.ts` | `/api/h5/chat` 新增 `mentionedCharacterId` 参数分支 |

---

## 3. 角色面板 UI

### 触发位置
标题栏左侧，关闭按钮（‹）右侧新增 👥 图标按钮。  
有角色数据时图标右上角显示数量徽章；无角色时隐藏整个图标。

### 面板布局
```
┌─────────────────────────────────┐
│ 本书角色  ·  37位               │
├─────────────────────────────────┤
│ 🟡 林黛玉   待字闺中  [@ 召唤] [独立对话] │
│ 🟡 贾宝玉   衔玉而生  [@ 召唤] [独立对话] │
│ ⚪ 薛宝钗 ✨ 未初始化 [@ 召唤] [独立对话] │
└─────────────────────────────────┘
最多显示 5 条，可滚动；面板外点击关闭
```

- **`@ 召唤`**：插入 `@角色名` 到输入框光标处，关闭面板，聚焦输入框
- **`独立对话`**：关闭当前对话，以该角色身份重新进入（触发 SoulLoading → SoulDialog）
- `status === 'pending'` 显示 ✨ 徽章和"未初始化"副标题

### 数据来源
SoulDialog 挂载时调用 `/api/h5/books/${book.id}/characters`，存入组件内部 `characters` 状态。

---

## 4. @ Picker 扩展

### 分组结构
```
┌─────────────────────────────────┐
│ 本书角色                         │  ← 新增，仅当 characters.length > 0
│  林黛玉  · 待字闺中              │
│  ✨ 薛宝钗  · 未初始化           │
├─────────────────────────────────┤
│ 其他书作者                       │  ← 原有
│  《论语》  孔子 · 春秋           │
└─────────────────────────────────┘
```
- 角色副标题：`identity`（身份设定）；pending 时显示"未初始化"
- 搜索时角色和书同时过滤（按名字 / 书名匹配）
- 角色与 guest author 互斥：任意一方已选则屏蔽 @ 触发

### 选中后 UI
输入框上方出现已选标签，可点 ✕ 取消：
```
┌──────────────────────────────────┐
│ 🟡 林黛玉  ·  红楼梦角色    ✕   │
├──────────────────────────────────┤
│ @林黛玉 你觉得...               │
└──────────────────────────────────┘
```

---

## 5. 前端新增状态与发送逻辑

### 新增状态
```typescript
const [mentionedCharacter, setMentionedCharacter] = useState<{
  id: number;
  name: string;
  status: string;
} | null>(null);
```

### sendMessage 分支
```
if (currentGuest)             → streamChatAsGuest()               // 原有
else if (mentionedCharacter)  → streamChatAsMentionedCharacter()  // 新增
else                          → streamChat()                      // 原有
```

### streamChatAsMentionedCharacter 要点
```typescript
// 请求体
{ bookTitle, sessionId, messages: history, mentionedCharacterId: id }

// 消息气泡：复用 guestAuthor 渲染
guestAuthor: { name: charName, color: '#c8a96e', title: '' }

// 持久化
saveMessage(sessionId, convId, 'guest', full, userId, {
  speakerName: charName,
  guestBookTitle: null,   // 无书名，区别于跨书 guest
})
```

### 历史加载区分
`role === 'guest' && !guestBookTitle` → 本书角色消息，渲染时只显示 `speakerName`，不加"· 《书名》"后缀。

---

## 6. 后端 API 变更

### 新增参数
`POST /api/h5/chat` body 新增 `mentionedCharacterId?: number`

### 处理优先级
```
1. mentionedCharacterId  →  角色 @ 模式（新增）
2. characterId           →  独立角色对话（现有）
3. guestBookTitle        →  跨书访客作者（现有）
4. 否则                  →  普通作者对话（现有）
```

### 角色 @ 模式处理
1. `findUnique({ id: mentionedCharacterId })`
2. 若 `status === 'pending'`：执行与 `characterId` 路径**完全相同**的懒初始化流程
3. 构建 system prompt（见下）
4. SSE 流式返回

### System Prompt（角色 @ 模式）
```
你是{name}，{identity}。
你的灵魂档案如下：
性格特征：{personality}
核心观点：{coreViews.join('；')}
知识边界：{knowledgeLimits}
说话风格：{speakingStyle}

你被读者在与《{bookTitle}》的对话中@提及，正在以旁观者角度加入这场讨论。
规则：
- 始终以第一人称作为{name}回答，保持角色身份。
- 结合当前对话的语境发表你的观点或感受。
- 回答控制在 20~300 字以内。
```
与独立角色对话 prompt 的区别：加入"被@提及、以旁观者角度加入讨论"的语境说明。

---

## 7. 不变更的接口/表

| 组件 | 状态 |
|------|------|
| `Character` 表 | 无变更 |
| `ChatMessage` 表 | 无变更（`role='guest'` + `speakerName` + `guestBookTitle=null`） |
| `generateCharacterPersona()` | 无变更 |
| `/api/h5/characters/:id` | 无变更 |
| `/api/h5/books/:id/characters` | 无变更 |
| `/api/h5/chat-history` | 无变更 |

---

## 8. Props 变更

`SoulDialog` 新增 prop：
```typescript
onOpenCharacterDialog?: (charId: number, charName: string) => void;
```
`App.tsx` 提供实现：关闭当前 SoulDialog → 设置 `dialogCharacterId` / `dialogCharacterName` → 触发 SoulLoading。
