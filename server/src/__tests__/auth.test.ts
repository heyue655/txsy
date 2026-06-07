import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

// 测试用前缀，避免污染正式数据
const TEST_PREFIX = 'test_vitest_'

/**
 * 清理本次测试创建的用户（用户名以 TEST_PREFIX 开头）
 */
async function cleanupTestUsers() {
  await prisma.user.deleteMany({
    where: { username: { startsWith: TEST_PREFIX } },
  })
}

// 全局清理：所有测试结束后断开连接
afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

describe('POST /api/h5/auth/register', () => {
  beforeAll(async () => {
    await cleanupTestUsers()
  })

  afterAll(async () => {
    await cleanupTestUsers()
  })

  afterEach(async () => {
    // 每个测试后清理，避免唯一约束冲突
    await cleanupTestUsers()
  })

  it('正常注册返回 token 和用户信息', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: `${TEST_PREFIX}user1`, password: 'pass1234' })
      .expect(200)

    expect(res.body.code).toBe(0)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.username).toBe(`${TEST_PREFIX}user1`)
    expect(res.body.data.user.inviteCode).toBeTruthy()
    expect(res.body.data.user.inviteCode).toHaveLength(8)
  })

  it('注册时携带昵称', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: `${TEST_PREFIX}user2`, password: 'pass1234', nickname: '测试学子' })
      .expect(200)

    expect(res.body.code).toBe(0)
    expect(res.body.data.user.nickname).toBe('测试学子')
  })

  it('用户名过短返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: 'ab', password: 'pass1234' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/长度.*3/)
  })

  it('密码过短返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: `${TEST_PREFIX}user3`, password: '123' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/密码/)
  })

  it('用户名含非法字符返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: 'user@name!', password: 'pass1234' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/只允许/)
  })

  it('用户名重复返回 400', async () => {
    // 先注册
    await request(app)
      .post('/api/h5/auth/register')
      .send({ username: `${TEST_PREFIX}dup`, password: 'pass1234' })

    // 再注册同名用户
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ username: `${TEST_PREFIX}dup`, password: 'pass9999' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/已被使用/)
  })

  it('缺少用户名返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/register')
      .send({ password: 'pass1234' })
      .expect(400)

    expect(res.body.code).toBe(1)
  })
})

describe('POST /api/h5/auth/login', () => {
  const testUser = { username: `${TEST_PREFIX}login`, password: 'pass1234' }

  beforeAll(async () => {
    await cleanupTestUsers()
    // 创建测试用户
    await request(app).post('/api/h5/auth/register').send(testUser)
  })

  afterAll(async () => {
    await cleanupTestUsers()
  })

  it('正确凭据登录成功返回 token', async () => {
    const res = await request(app)
      .post('/api/h5/auth/login')
      .send(testUser)
      .expect(200)

    expect(res.body.code).toBe(0)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.username).toBe(testUser.username)
  })

  it('错误密码返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/login')
      .send({ username: testUser.username, password: 'wrongpass' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/用户名或密码错误/)
  })

  it('不存在的用户返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/login')
      .send({ username: 'no_such_user_xyz', password: 'pass1234' })
      .expect(400)

    expect(res.body.code).toBe(1)
    expect(res.body.message).toMatch(/用户名或密码错误/)
  })

  it('缺少密码返回 400', async () => {
    const res = await request(app)
      .post('/api/h5/auth/login')
      .send({ username: testUser.username })
      .expect(400)

    expect(res.body.code).toBe(1)
  })
})
