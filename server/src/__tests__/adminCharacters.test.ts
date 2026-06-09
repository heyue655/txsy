import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

const TEST_PREFIX = 'test_vitest_adminchar_'

describe('Admin Character Management APIs', () => {
  let testBookId: number
  let testCharId: number

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: {
        title: `${TEST_PREFIX}book`,
        author: `${TEST_PREFIX}author`,
        era: 'Test Era',
      }
    })
    testBookId = book.id
    const char = await prisma.character.create({
      data: { bookId: testBookId, name: `${TEST_PREFIX}char`, status: 'ready' }
    })
    testCharId = char.id
  })

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { bookId: testBookId } })
    await prisma.book.delete({ where: { id: testBookId } })
  })

  // GET /api/admin/books/:id/characters
  it('GET /api/admin/books/:id/characters 返回角色列表', async () => {
    const res = await request(app)
      .get(`/api/admin/books/${testBookId}/characters`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    const char = res.body.data.find((c: any) => c.id === testCharId)
    expect(char).toBeDefined()
    expect(char).toHaveProperty('name')
    expect(char).toHaveProperty('status')
  })

  // POST /api/admin/books/:id/characters
  it('POST /api/admin/books/:id/characters 创建新角色', async () => {
    const res = await request(app)
      .post(`/api/admin/books/${testBookId}/characters`)
      .send({ name: `${TEST_PREFIX}new_char` })
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data.name).toBe(`${TEST_PREFIX}new_char`)
    expect(res.body.data.status).toBe('pending')
    // cleanup
    await prisma.character.delete({ where: { id: res.body.data.id } })
  })

  it('POST /api/admin/books/:id/characters 空名称返回 400', async () => {
    const res = await request(app)
      .post(`/api/admin/books/${testBookId}/characters`)
      .send({ name: '   ' })
      .expect(400)
    expect(res.body.code).toBe(1)
  })

  // DELETE /api/admin/characters/:id
  it('DELETE /api/admin/characters/:id 删除角色', async () => {
    const temp = await prisma.character.create({
      data: { bookId: testBookId, name: `${TEST_PREFIX}delete_me`, status: 'pending' }
    })
    const res = await request(app)
      .delete(`/api/admin/characters/${temp.id}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    const gone = await prisma.character.findUnique({ where: { id: temp.id } })
    expect(gone).toBeNull()
  })

  it('DELETE /api/admin/characters/:id 不存在返回 404', async () => {
    const res = await request(app)
      .delete('/api/admin/characters/99999999')
      .expect(404)
    expect(res.body.code).toBe(1)
  })

  // POST /api/admin/characters/:id/regenerate
  it('POST /api/admin/characters/:id/regenerate 重置角色状态', async () => {
    // Give the char a non-pending status + some fields first
    await prisma.character.update({
      where: { id: testCharId },
      data: { status: 'ready', identity: '某角色', personality: '沉稳' }
    })
    const res = await request(app)
      .post(`/api/admin/characters/${testCharId}/regenerate`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.status).toBe('pending')
    expect(res.body.data.identity).toBeNull()
    expect(res.body.data.personality).toBeNull()
  })
})
