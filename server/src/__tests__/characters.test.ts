import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, prisma } from '../index'

const TEST_PREFIX = 'test_vitest_'

describe('GET /api/h5/books/:id/characters', () => {
  let testBookId: number

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: { title: `${TEST_PREFIX}TestBook`, author: 'TestAuthor', era: 'Modern' }
    })
    testBookId = book.id
    
    await prisma.character.createMany({
      data: [
        { bookId: testBookId, name: '角色 A', status: 'ready' },
        { bookId: testBookId, name: '角色 B', status: 'pending' }
      ]
    })
  })

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { bookId: testBookId } })
    await prisma.book.delete({ where: { id: testBookId } })
  })

  it('返回书籍的角色列表', async () => {
    const res = await request(app)
      .get(`/api/h5/books/${testBookId}/characters`)
      .expect(200)

    expect(res.body.code).toBe(0)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toHaveProperty('id')
    expect(res.body.data[0]).toHaveProperty('name')
    expect(res.body.data[0]).toHaveProperty('status')
  })
})
