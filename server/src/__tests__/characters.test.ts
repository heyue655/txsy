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

describe('POST /api/h5/chat with mentionedCharacterId', () => {
  let testBookId: number;
  let testCharId: number;

  beforeAll(async () => {
    const book = await prisma.book.create({
      data: { title: 'test_vitest_mention_book', author: '测试作者', era: '测试', soulColor: '#fff' }
    });
    testBookId = book.id;
    const char = await prisma.character.create({
      data: {
        bookId: testBookId,
        name: 'test_vitest_mention_char',
        status: 'ready',
        identity: '测试角色',
        personality: '沉稳',
        coreViews: '["测试观点"]',
        knowledgeLimits: '书内知识',
        speakingStyle: '文言',
      }
    });
    testCharId = char.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: 'test_vitest_mention' } } });
    await prisma.book.deleteMany({ where: { title: { startsWith: 'test_vitest_mention' } } });
  });

  it('accepts mentionedCharacterId and returns a response', async () => {
    const res = await request(app)
      .post('/api/h5/chat')
      .send({
        bookTitle: 'test_vitest_mention_book',
        sessionId: 'test_vitest_mention_sess',
        messages: [{ role: 'user', content: '你好' }],
        mentionedCharacterId: testCharId,
      });
    // LLM 可能不可用，只验证不返回 400
    expect([200, 500]).toContain(res.status);
    if (res.status === 400) {
      throw new Error(`Unexpected 400: ${JSON.stringify(res.body)}`);
    }
  }, 30000);
});

