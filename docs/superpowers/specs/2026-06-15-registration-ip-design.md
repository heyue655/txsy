# 用户注册 IP 记录设计规范

**日期**: 2026-06-15  
**状态**: 已批准  
**影响范围**: `server/prisma/schema.prisma`, `server/src/index.ts`, `server/src/__tests__/auth.test.ts`

---

## 背景

当前用户注册接口已支持 `fingerprint`（浏览器指纹）字段，但未记录注册时的客户端 IP 地址。增加 IP 记录可辅助识别同一设备/网络的重复注册行为，供后台运营分析使用。

---

## 目标

- 注册时将客户端 IP 写入数据库
- 仅记录，不拦截（不影响正常注册流程）
- 支持 Nginx / CDN 反向代理部署场景

---

## 数据模型变更

### `User` 表新增字段

```prisma
registrationIp  String?  @db.VarChar(45)  // IPv4 最长 15 位，IPv6 最长 39 位，含映射前缀最长 45 位
```

字段为可选（`?`），老数据自然为 `NULL`，无需迁移脚本。

---

## IP 提取策略

优先级从高到低：

| 来源 | Header / 属性 | 适用场景 |
|---|---|---|
| 1 | `X-Forwarded-For`（取第一个值） | Nginx / CDN 转发 |
| 2 | `X-Real-IP` | 部分 Nginx 配置 |
| 3 | `req.socket.remoteAddress` | 直连（开发/测试） |

取到的值若含端口号（如 `::ffff:127.0.0.1`），直接原样存储，便于后续分析。

---

## 接口变更

### `POST /api/h5/auth/register`

- **请求体**：不变
- **响应**：不变（IP 不对外暴露）
- **内部变更**：
  1. 调用 `getClientIp(req)` 提取 IP
  2. 在 `prisma.user.create({ data: { ..., registrationIp: ip } })` 中写入

---

## 测试变更

`server/src/__tests__/auth.test.ts` 新增断言：

```typescript
// 注册成功后，查库验证 registrationIp 已写入
const user = await prisma.user.findUnique({ where: { username: testUsername } });
expect(user?.registrationIp).toBeTruthy();
```

---

## 不在本次范围内

- 后台管理界面展示 IP
- 基于 IP 的注册频率限制
- IP 地理位置解析
