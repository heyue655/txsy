import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../index';

const TEST_PREFIX = 'adminstats_vitest_';

async function cleanupTestData() {
  await prisma.chatMessage.deleteMany({
    where: { userId: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { username: { startsWith: TEST_PREFIX } },
  });
}

describe('Admin Stats APIs', () => {
  beforeAll(async () => { await cleanupTestData(); });
  afterAll(async () => { await cleanupTestData(); });

  describe('GET /api/admin/stats/dashboard', () => {
    it('返回正确的数据结构，所有字段均为 number', async () => {
      const res = await request(app).get('/api/admin/stats/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(typeof d.totalUsers).toBe('number');
      expect(typeof d.todayNewUsers).toBe('number');
      expect(typeof d.todayActiveUsers).toBe('number');
      expect(typeof d.todayMessages).toBe('number');
      expect(typeof d.totalMessages).toBe('number');
      expect(d.totalUsers).toBeGreaterThanOrEqual(0);
    });

    it('新注册用户后 totalUsers 和 todayNewUsers 各增 1', async () => {
      const before = (await request(app).get('/api/admin/stats/dashboard')).body.data;

      await prisma.user.create({
        data: { username: `${TEST_PREFIX}u1`, password: 'hash' },
      });

      const after = (await request(app).get('/api/admin/stats/dashboard')).body.data;
      expect(after.totalUsers).toBe(before.totalUsers + 1);
      expect(after.todayNewUsers).toBe(before.todayNewUsers + 1);
    });
  });

  describe('GET /api/admin/stats/report', () => {
    it('days=7 时返回长度为 7 的数组', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=7');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(d.dates.length).toBe(7);
      expect(d.newUsers.length).toBe(7);
      expect(d.activeUsers.length).toBe(7);
      expect(d.messages.length).toBe(7);
    });

    it('无参数时默认返回 30 天', async () => {
      const res = await request(app).get('/api/admin/stats/report');
      expect(res.body.data.dates.length).toBe(30);
    });

    it('自定义 startDate/endDate 返回正确的日期范围', async () => {
      const res = await request(app).get(
        '/api/admin/stats/report?startDate=2026-01-01&endDate=2026-01-10',
      );
      expect(res.body.code).toBe(0);
      const d = res.body.data;
      expect(d.dates.length).toBe(10);
      expect(d.dates[0]).toBe('2026-01-01');
      expect(d.dates[9]).toBe('2026-01-10');
    });

    it('各数组长度与 dates 一致', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=14');
      const d = res.body.data;
      expect(d.newUsers.length).toBe(d.dates.length);
      expect(d.activeUsers.length).toBe(d.dates.length);
      expect(d.messages.length).toBe(d.dates.length);
    });

    it('无效日期格式返回 400', async () => {
      const res = await request(app).get(
        '/api/admin/stats/report?startDate=not-a-date&endDate=also-not',
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('所有数值均为非负整数', async () => {
      const res = await request(app).get('/api/admin/stats/report?days=7');
      const d = res.body.data;
      for (const v of [...d.newUsers, ...d.activeUsers, ...d.messages]) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
