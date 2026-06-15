import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/** 将 Date 对象格式化为本地时区 YYYY-MM-DD 字符串 */
function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 生成从 startDate 到 endDate（含）的日期字符串数组 */
function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    dates.push(toLocalDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** 将原始查询返回的 date 字段统一转为 YYYY-MM-DD */
function normalizeDate(raw: Date | string): string {
  if (raw instanceof Date) return toLocalDateStr(raw);
  return String(raw).slice(0, 10);
}

// GET /api/admin/stats/dashboard — 首页概览统计
router.get('/dashboard', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalUsers, todayNewUsers, todayActiveResult, todayMessages, totalMessages] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
        // distinct userId（非 null）= 注册用户 + 访客 fingerprint 当天有发言
        prisma.chatMessage.groupBy({
          by: ['userId'],
          where: {
            createdAt: { gte: today, lt: tomorrow },
            userId: { not: null },
          },
        }),
        prisma.chatMessage.count({
          where: { createdAt: { gte: today, lt: tomorrow }, role: 'user' },
        }),
        prisma.chatMessage.count({ where: { role: 'user' } }),
      ]);

    res.json({
      code: 0,
      data: {
        totalUsers,
        todayNewUsers,
        todayActiveUsers: todayActiveResult.length,
        todayMessages,
        totalMessages,
      },
    });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// GET /api/admin/stats/report — 按日期分组的报表数据
// Query params: days=30 | startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/report', async (req, res) => {
  try {
    const { days, startDate, endDate } = req.query as {
      days?: string;
      startDate?: string;
      endDate?: string;
    };

    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ code: 1, message: '日期格式错误，请使用 YYYY-MM-DD' });
      }
    } else {
      const daysNum = Math.min(Math.max(parseInt(days || '30') || 30, 1), 180);
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - daysNum + 1);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const dates = generateDateRange(start, end);

    // 每日新增用户（users 表）
    const newUsersRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM users
      WHERE createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY DATE(createdAt)
    `;

    // 每日活跃用户（chat_messages 表，按 userId distinct）
    const activeUsersRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(DISTINCT userId) as count
      FROM chat_messages
      WHERE createdAt >= ${start} AND createdAt <= ${end} AND userId IS NOT NULL
      GROUP BY DATE(createdAt)
    `;

    // 每日对话次数（chat_messages 表，role='user'）
    const messagesRaw = await prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM chat_messages
      WHERE createdAt >= ${start} AND createdAt <= ${end} AND role = 'user'
      GROUP BY DATE(createdAt)
    `;

    // 转换为 Map<dateStr, number>，便于填充空日期
    const toMap = (rows: Array<{ date: Date | string; count: bigint }>) => {
      const m = new Map<string, number>();
      for (const row of rows) m.set(normalizeDate(row.date), Number(row.count));
      return m;
    };

    const newUsersMap = toMap(newUsersRaw);
    const activeUsersMap = toMap(activeUsersRaw);
    const messagesMap = toMap(messagesRaw);

    res.json({
      code: 0,
      data: {
        dates,
        newUsers: dates.map(d => newUsersMap.get(d) ?? 0),
        activeUsers: dates.map(d => activeUsersMap.get(d) ?? 0),
        messages: dates.map(d => messagesMap.get(d) ?? 0),
      },
    });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

export default router;
