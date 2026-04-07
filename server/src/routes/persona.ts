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

    // 检查是否为独立灵魂档案类型（不与具体书籍绑定）
    let isSoulArchive = false;
    try {
      const cats: string[] = JSON.parse((book as any).categories || '[]');
      isSoulArchive = cats.includes('灵魂档案');
    } catch {}

    const openingDesc = '以第一人称用此人身份写3条尖锐犀利、直击现代人痛点的开场白，每条一行，用换行分隔。要求：直击现代人的内心痛处或思维盲区，带有质疑和挑战意味，让读者感到被冒犯但又无法反驳，每条100字内';

    const prompt = isSoulArchive
      ? `你是一位文史专家和角色设计大师。请根据以下作者信息，生成一份完整的"灵魂档案"——用于让AI扮演此人与现代读者对话。这份档案代表此人的整体人格，而非某一部具体作品。

作者：${book.author}
年代：${book.era}
${book.description ? `背景：${book.description}` : ''}

请按以下JSON格式返回（每个字段都是字符串，核心观点是数组）：
{
  "identity": "身份设定，描述此人的历史身份、思想传承（100字内）",
  "profession": "专业领域（50字内）",
  "socialStatus": "社会地位和历史影响力（80字内）",
  "personality": "性格特征（80字内）",
  "coreViews": ["此人最核心的思想主张1", "主张2", "主张3", "主张4"],
  "logicWeapons": "惯用的论证方式和思辨手法（80字内）",
  "communicationStyle": "与人交流时的特点（80字内）",
  "catchphrases": "经典语录，用分号分隔（100字内）",
  "emotions": "喜好与厌恶（80字内）",
  "knowledgeLimits": "知识边界（60字内）",
  "speakingStyle": "语言特点和文风（60字内）",
  "openingQuestion": "${openingDesc}"
}

注意：严格基于历史事实，不要虚构；只返回JSON，不要其他内容`
      : `你是一位文史专家和角色设计大师。请根据以下书籍信息，生成一份详尽的"灵魂档案"——用于让AI扮演该书作者与现代读者对话。

书籍：《${book.title}》
作者：${book.author}
年代：${book.era}
${book.description ? `简介：${book.description}` : ''}

请按以下JSON格式返回（每个字段都是字符串，核心观点是数组）：
{
  "identity": "身份设定，描述此人在写作此书时的身份、背景（100字内）",
  "profession": "专业领域（50字内）",
  "socialStatus": "社会地位（80字内）",
  "personality": "性格特征（80字内）",
  "coreViews": ["此书的核心观点1", "核心观点2", "核心观点3", "核心观点4"],
  "logicWeapons": "逻辑武器（80字内）",
  "communicationStyle": "交流风格（80字内）",
  "catchphrases": "口头禅，用分号分隔（100字内）",
  "emotions": "情绪态度（80字内）",
  "knowledgeLimits": "知识边界（60字内）",
  "speakingStyle": "说话风格（60字内）",
  "openingQuestion": "${openingDesc}"
}

注意：严格基于历史事实和此书内容，不要虚构；只返回JSON，不要其他内容`;

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

    const bodyText = await response.text();
    if (!response.ok) {
      let errMsg = `LLM 错误 ${response.status}`;
      try { errMsg = JSON.parse(bodyText).error?.message || errMsg; } catch {}
      return res.status(500).json({ code: 1, message: errMsg });
    }

    let data: any;
    try { data = JSON.parse(bodyText); }
    catch { return res.status(502).json({ code: 1, message: '大模型响应格式异常，请检查 LLM 配置是否正确' }); }

    let content = data.choices?.[0]?.message?.content || '';

    // 清理 markdown 代码块
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 有些模型可能包含 <think> 标签
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let persona: any;
    try { persona = JSON.parse(content); }
    catch { return res.status(500).json({ code: 1, message: '模型返回格式无法解析，请重试' }); }

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
