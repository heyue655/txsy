import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// 获取某本书的 persona
router.get('/:bookId', async (req, res) => {
  try {
    const persona = await prisma.authorPersona.findUnique({
      where: { bookId: parseInt(req.params.bookId) },
    });
    if (!persona) return res.status(404).json({ code: 1, message: '未找到' });
    res.json({ code: 0, data: persona });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 创建或更新 persona（upsert）
router.post('/:bookId', async (req, res) => {
  try {
    const bookId = parseInt(req.params.bookId);
    const {
      identity, personality, coreViews, knowledgeLimits, speakingStyle, openingQuestion,
      profession, socialStatus, logicWeapons, communicationStyle, catchphrases, emotions,
    } = req.body;
    const coreViewsStr = typeof coreViews === 'string' ? coreViews : JSON.stringify(coreViews || []);
    const persona = await prisma.authorPersona.upsert({
      where: { bookId },
      create: {
        bookId,
        identity: identity || '',
        personality: personality || '',
        coreViews: coreViewsStr,
        knowledgeLimits: knowledgeLimits || '',
        speakingStyle: speakingStyle || '',
        openingQuestion: openingQuestion || '',
        profession: profession || '',
        socialStatus: socialStatus || '',
        logicWeapons: logicWeapons || '',
        communicationStyle: communicationStyle || '',
        catchphrases: catchphrases || '',
        emotions: emotions || '',
      },
      update: {
        identity,
        personality,
        coreViews: coreViewsStr,
        knowledgeLimits,
        speakingStyle,
        openingQuestion,
        profession: profession ?? undefined,
        socialStatus: socialStatus ?? undefined,
        logicWeapons: logicWeapons ?? undefined,
        communicationStyle: communicationStyle ?? undefined,
        catchphrases: catchphrases ?? undefined,
        emotions: emotions ?? undefined,
      },
    });
    res.json({ code: 0, data: persona });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// AI 自动生成灵魂档案
router.post('/:bookId/auto-generate', async (req, res) => {
  try {
    const bookId = parseInt(req.params.bookId);
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return res.status(404).json({ code: 1, message: '书籍不存在' });

    const config = await prisma.lLMConfig.findFirst({ where: { isActive: true } });
    if (!config) return res.status(400).json({ code: 1, message: '未配置大模型，请先在大模型配置中设置' });

    const prompt = `你是一位文史专家和角色设计大师。请根据以下书籍信息，生成一份详尽的"灵魂档案"——用于让AI扮演该书作者与现代读者对话。

书籍：《${book.title}》
作者：${book.author}
年代：${book.era}
${book.description ? `简介：${book.description}` : ''}

请按以下JSON格式返回（每个字段都是字符串，核心观点是数组）：
{
  "identity": "身份设定，描述此人在写作此书时的身份、背景（100字内）",
  "profession": "专业领域，此人擅长的学术/技能领域（50字内）",
  "socialStatus": "社会地位，此人在当时社会的地位和影响力（80字内）",
  "personality": "性格特征，鲜明的性格描写（80字内）",
  "coreViews": ["此书的核心观点1", "核心观点2", "核心观点3", "核心观点4"],
  "logicWeapons": "逻辑武器，此人惯用的论证方式和思辨手法（80字内）",
  "communicationStyle": "交流风格，与人交流时的特点和习惯（80字内）",
  "catchphrases": "口头禅，此人常说的话或经典语录，用分号分隔（100字内）",
  "emotions": "情绪态度，喜好什么、厌恶什么、对什么充满热情（80字内）",
  "knowledgeLimits": "知识边界，此人不知道什么、不应该谈什么（60字内）",
  "speakingStyle": "说话风格，语言特点和文风（60字内）",
  "openingQuestion": "以第一人称用此人身份写3条不同风格的开场白，每条一行，用换行分隔（含提问式、故事式、自述式各一条，每条100字内）"
}

注意：
- 严格基于历史事实和此书内容，不要虚构
- 体现此人在创作此书时期的独特视角
- 开场白要有个人魅力，能吸引读者对话
- 只返回JSON，不要其他内容`;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errBody: any = await response.json().catch(() => ({}));
      return res.status(500).json({ code: 1, message: errBody.error?.message || `LLM 错误 ${response.status}` });
    }

    const data: any = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // 清理 markdown 代码块
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 有些模型可能包含 <think> 标签
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    const persona = JSON.parse(content);
    res.json({ code: 0, data: persona });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: '生成失败: ' + e.message });
  }
});

// 删除 persona
router.delete('/:bookId', async (req, res) => {
  try {
    await prisma.authorPersona.delete({
      where: { bookId: parseInt(req.params.bookId) },
    });
    res.json({ code: 0, message: '已删除' });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

export default router;
