import { Router } from 'express'
import { prisma } from '../index'

const router = Router()

router.get('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id.replace(/\D/g, ''))
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })

    const characters = await prisma.character.findMany({
      where: { bookId, isActive: true } as any,
      select: { id: true, name: true, status: true, identity: true },
      orderBy: { id: 'asc' }
    })
    res.json({ code: 0, data: characters })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

router.get('/characters/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' })

    const character = await prisma.character.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, identity: true, personality: true }
    })
    if (!character) return res.status(404).json({ code: 1, message: '角色不存在' })
    res.json({ code: 0, data: character })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

export default router
