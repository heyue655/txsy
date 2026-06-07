import { Router } from 'express'
import { prisma } from '../index'

const router = Router()

router.get('/books/:id/characters', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id)
    if (isNaN(bookId)) return res.status(400).json({ code: 1, message: '参数错误' })

    const characters = await prisma.character.findMany({
      where: { bookId },
      select: { id: true, name: true, status: true },
      orderBy: { id: 'asc' }
    })
    res.json({ code: 0, data: characters })
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message })
  }
})

export default router
