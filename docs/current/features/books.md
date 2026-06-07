# 书籍管理功能规格

## 功能概述

书籍是太虚书院的核心内容单元，每本书对应一个 3D 星球，并关联一份作者灵魂档案。

## 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int | 自增主键 |
| title | String | 书名，如《论语》 |
| author | String | 作者，如孔子 |
| era | String | 朝代，如春秋 |
| soulColor | String | 星球灵魂色（HEX），用于 3D 场景 |
| color | String | 书籍卡片背景色（HEX） |
| description | String? | 简介 |
| categories | String | JSON 数组字符串，如 `["古籍","儒家"]` |
| isActive | Boolean | 是否在前台展示 |
| sortOrder | Int | 展示排序 |

## 分类标签

categories 字段存储 JSON 数组，支持多分类：
- 常用分类：古籍、儒家、道家、兵法、诗词、史书、医学、文学

## 作者灵魂档案（AuthorPersona）

每本书可关联一份人格档案，用于构建 AI 对话的 system prompt：

| 字段 | 说明 |
|------|------|
| identity | 身份设定（1~2句话） |
| personality | 性格特征 |
| coreViews | 核心观点（JSON 数组） |
| knowledgeLimits | 知识边界（AI 不知道的内容） |
| speakingStyle | 说话风格 |
| openingQuestion | 开场问题（首次对话时提出） |
| profession | 专业领域 |
| socialStatus | 社会地位 |
| logicWeapons | 常用论证方式 |
| communicationStyle | 交流风格 |
| catchphrases | 口头禅 |
| emotions | 情绪态度（喜欢/讨厌的事物） |

## 测试用例

| 用例 | 期望 |
|------|------|
| GET /api/h5/books | 只返回 isActive: true 的书籍，按 sortOrder 升序 |
| GET /api/h5/books | 响应中包含关联的 persona 数据 |
| 书籍无 persona | persona 字段为 null，不报错 |
| GET /api/books (Admin) | 返回所有书籍（含非激活） |
| POST /api/books | 创建书籍，默认 isActive: true |
| PUT /api/books/:id | 更新指定字段 |
| DELETE /api/books/:id | 级联删除关联的 persona |
