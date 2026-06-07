import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

// 测试用书籍记录（创建后统一清理）
const TEST_BOOK_TITLE = '测试书籍_vitest'
let testBookId: number

// 全局清理：所有测试结束后断开连接
afterAll(async () => {
  await prisma.book.deleteMany({ where: { title: { startsWith: '测试书籍_vitest' } } })
  await prisma.$disconnect()
})

describe('GET /api/h5/books — H5 书籍列表', () => {
  beforeAll(async () => {
    // 创建一本测试书籍（isActive: true）
    const book = await prisma.book.create({
      data: {
        title: TEST_BOOK_TITLE,
        author: '测试作者',
        era: '测试朝代',
        soulColor: '#ffffff',
        color: '#ffffff',
        isActive: true,
        sortOrder: 9999,
      },
    })
    testBookId = book.id
  })

  afterAll(async () => {
    // 清理由 describe 内部创建的测试数据（全局 afterAll 会做最终清理）
    await prisma.book.deleteMany({ where: { title: TEST_BOOK_TITLE } })
  })

  it('返回激活状态的书籍列表', async () => {
    const res = await request(app).get('/api/h5/books').expect(200)

    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data)).toBe(true)
    // 我们创建的测试书籍应该在列表中
    const found = res.body.data.find((b: { id: number }) => b.id === testBookId)
    expect(found).toBeDefined()
    expect(found.title).toBe(TEST_BOOK_TITLE)
  })

  it('返回的书籍包含 persona 字段', async () => {
    const res = await request(app).get('/api/h5/books').expect(200)

    expect(res.body.code).toBe(0)
    const book = res.body.data.find((b: { id: number }) => b.id === testBookId)
    // 没有关联 persona 时字段应为 null，而不是缺失
    expect(book).toHaveProperty('persona')
  })

  it('按 sortOrder 升序排列', async () => {
    const res = await request(app).get('/api/h5/books').expect(200)

    const orders = res.body.data.map((b: { sortOrder: number }) => b.sortOrder)
    const sorted = [...orders].sort((a: number, b: number) => a - b)
    expect(orders).toEqual(sorted)
  })

  it('不激活的书籍不在列表中', async () => {
    // 创建一本非激活书籍
    const inactive = await prisma.book.create({
      data: {
        title: `${TEST_BOOK_TITLE}_inactive`,
        author: '隐藏作者',
        era: '测试',
        isActive: false,
        sortOrder: 9998,
      },
    })

    const res = await request(app).get('/api/h5/books').expect(200)

    const found = res.body.data.find((b: { id: number }) => b.id === inactive.id)
    expect(found).toBeUndefined()

    // 清理
    await prisma.book.delete({ where: { id: inactive.id } })
  })
})

describe('GET /api/h5/llm-config — LLM 配置（脱敏）', () => {
  afterAll(async () => {
    // 全局 afterAll 会断开连接
  })

  it('无激活配置时返回 data: null', async () => {
    // 确保没有激活配置（或者已有激活配置时返回脱敏数据）
    const activeCfg = await prisma.lLMConfig.findFirst({ where: { isActive: true } })

    const res = await request(app).get('/api/h5/llm-config').expect(200)

    expect(res.body.code).toBe(0)
    if (!activeCfg) {
      expect(res.body.data).toBeNull()
    } else {
      // 有激活配置时 apiKey 应被脱敏
      expect(res.body.data).toBeDefined()
      if (activeCfg.apiKey && activeCfg.apiKey.length > 10) {
        expect(res.body.data.apiKey).toContain('****')
        expect(res.body.data.apiKey).not.toBe(activeCfg.apiKey)
      }
    }
  })
})
