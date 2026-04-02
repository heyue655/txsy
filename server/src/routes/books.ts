import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// 获取所有书籍
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const books = await prisma.book.findMany({
      include: { persona: true },
      orderBy: { sortOrder: 'asc' },
    });
    // 按分类过滤（categories 存为 JSON 字符串数组）
    const filtered = category
      ? books.filter((b: any) => {
          try {
            const cats: string[] = JSON.parse((b as any).categories || '[]');
            return cats.includes(category as string);
          } catch { return false; }
        })
      : books;
    res.json({ code: 0, data: filtered });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 获取单本书
router.get('/:id', async (req, res) => {
  try {
    const book = await prisma.book.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { persona: true },
    });
    if (!book) return res.status(404).json({ code: 1, message: '书籍不存在' });
    res.json({ code: 0, data: book });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 新增书籍
router.post('/', async (req, res) => {
  try {
    const { title, author, era, soulColor, color, description, categories, isActive, sortOrder } = req.body;
    const book = await prisma.book.create({
      data: {
        title: title || '',
        author: author || '',
        era: era || '',
        soulColor: soulColor || '#ffd700',
        color: color || '#fff4d1',
        description: description || null,
        categories: typeof categories === 'string' ? categories : JSON.stringify(categories || []),
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
      },
    });
    res.json({ code: 0, data: book });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 更新书籍
router.put('/:id', async (req, res) => {
  try {
    const book = await prisma.book.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json({ code: 0, data: book });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 删除书籍
router.delete('/:id', async (req, res) => {
  try {
    await prisma.book.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ code: 0, message: '已删除' });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

export default router;
