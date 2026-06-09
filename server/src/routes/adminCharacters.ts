import { Router } from 'express'
import { prisma } from '../index'

const router = Router()

// GET /api/admin/books/:id/characters
router.get('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })
    const characters = await prisma.character.findMany({
      where: { bookId },
      orderBy: { id: 'asc' },
    })
    res.json({ code: 0, data: characters })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// POST /api/admin/books/:id/characters
router.post('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })
    const name = (req.body.name || '').trim()
    if (!name) return res.status(400).json({ code: 1, message: '角色名不能为空' })
    const character = await prisma.character.create({
      data: { bookId, name, status: 'pending' },
    })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// DELETE /api/admin/characters/:id
router.delete('/characters/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })
    const existing = await prisma.character.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ code: 1, message: '角色不存在' })
    await prisma.character.delete({ where: { id } })
    res.json({ code: 0, data: null })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// POST /api/admin/characters/:id/regenerate
router.post('/characters/:id/regenerate', async (req, res) => {  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })
    const existing = await prisma.character.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ code: 1, message: '角色不存在' })
    const character = await prisma.character.update({
      where: { id },
      data: {
        status: 'pending',
        identity: null,
        personality: null,
        coreViews: null,
        knowledgeLimits: null,
        speakingStyle: null,
      },
    })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

// PATCH /api/admin/characters/:id  (toggle isActive)
router.patch('/characters/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') return res.status(400).json({ code: 1, message: 'isActive 必须为布尔值' })
    const existing = await prisma.character.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ code: 1, message: '角色不存在' })
    const character = await prisma.character.update({
      where: { id },
      data: { isActive } as any,
    })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

export default router
