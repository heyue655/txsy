# 用户认证功能规格

## 功能概述

太虚书院支持三种用户状态：访客（游览模式）、注册用户（完整功能）、SSO 单点登录用户。

## 用户状态

```
未登录访客
  ↓ 可免费发送 N 条消息（N 由 app_configs.guest_message_limit 配置，默认 3）
  ↓ 超出限制 → 弹出登录/注册弹窗
注册用户
  ↓ 无消息限制
  ↓ 可查看历史笔谈
  ↓ 有专属邀请码
SSO 用户
  ↓ 通过盒子平台 OAuth 授权
  ↓ 自动创建或匹配本地账号
```

## 注册规则

- 用户名：3~20 字符，允许字母/数字/下划线/中文
- 密码：最少 6 位
- 注册成功自动生成 8 位邀请码（字母数字混合）
- 注册返回 JWT token（有效期 90 天）

## JWT 结构

```json
{
  "id": 1,
  "username": "reader01",
  "iat": 1714900000,
  "exp": 1722676000
}
```

## 访客消息限制

- 前端通过 localStorage 中存储的 `guestMsgCount` 计数
- 后端从 `app_configs` 表读取 `guest_message_limit` key 的值
- 达到限制时返回 `{ code: 403, message: '已超出访客体验次数' }`

## 邀请系统

- 用户分享链接带 `?invite=<inviteCode>` 参数
- 访客访问时记录 `invitations` 表（fingerprint + inviterCode）
- 访客注册后关联 inviteeId

## 测试用例

| 用例 | 输入 | 期望输出 |
|------|------|----------|
| 正常注册 | 合法 username + password | code: 0, token 有效 |
| 用户名过短 | username: "ab" | code: 1, 长度错误提示 |
| 用户名重复 | 已存在的 username | code: 1, 已被使用 |
| 密码过短 | password: "123" | code: 1, 密码不能少于6位 |
| 正常登录 | 正确 username + password | code: 0, token 有效 |
| 错误密码 | 不匹配的 password | code: 1, 用户名或密码错误 |
| 用户名非法字符 | username: "user@name" | code: 1, 只允许字母... |
