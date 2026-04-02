import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import booksRouter from './routes/books';
import llmRouter from './routes/llm';
import personaRouter from './routes/persona';
import path from 'path';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'txbt_soul_secret_2026';
const GUEST_LIMIT_KEY = 'guest_message_limit';
const GUEST_LIMIT_DEFAULT = 3;

app.use(cors());
app.use(express.json());

// 静态文件：admin 后台页面
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// API 路由
app.use('/api/books', booksRouter);
app.use('/api/llm', llmRouter);
app.use('/api/persona', personaRouter);

// H5 前端接口：获取书籍列表（含 persona）
app.get('/api/h5/books', async (_req, res) => {
  try {
    const books = await prisma.book.findMany({
      where: { isActive: true },
      include: { persona: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ code: 0, data: books });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// H5 前端接口：获取当前激活的 LLM 配置（不返回完整 apiKey）
app.get('/api/h5/llm-config', async (_req, res) => {
  try {
    const config = await prisma.lLMConfig.findFirst({ where: { isActive: true } });
    if (!config) {
      return res.json({ code: 0, data: null });
    }
    // 脱敏 apiKey
    const masked = config.apiKey
      ? config.apiKey.slice(0, 6) + '****' + config.apiKey.slice(-4)
      : '';
    res.json({
      code: 0,
      data: { ...config, apiKey: masked },
    });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// H5 前端接口：AI 对话代理 —— SSE 流式输出
app.post('/api/h5/chat', async (req, res) => {
  try {
    const config = await prisma.lLMConfig.findFirst({ where: { isActive: true } });
    if (!config) {
      return res.status(400).json({ code: 1, message: '未配置大模型' });
    }
    const { messages, bookId, bookTitle, sessionId, guestBookTitle } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ code: 1, message: 'messages 参数缺失' });
    }

    // 查找书籍和人格档案，用于构建 system prompt
    // 若提供 guestBookTitle，则使用访客书籍的人格（@提及功能）
    const resolvedTitle = guestBookTitle || bookTitle;
    let systemPrompt = '你是一位古代文学大师，请与用户对话。';
    let book: any = null;
    if (bookId && !guestBookTitle) {
      book = await prisma.book.findUnique({ where: { id: bookId }, include: { persona: true } });
    } else if (resolvedTitle) {
      const cleanTitle = resolvedTitle.replace(/《|》/g, '');
      book = await prisma.book.findFirst({
        where: { title: { contains: cleanTitle } },
        include: { persona: true },
      });
    }

    // 院长特殊处理
    if (!book && (bookTitle === '__dean__' || sessionId === '__dean__')) {
      let dean = await prisma.deanConfig.findFirst({ where: { isActive: true } });
      if (!dean) {
        dean = await prisma.deanConfig.create({ data: DEAN_DEFAULT });
      }
      let coreViews: string[] = [];
      try { coreViews = JSON.parse(dean.coreViews); } catch { coreViews = [dean.coreViews]; }
      systemPrompt = `你是${dean.name}，${dean.title}。
你的档案：
身份：${dean.identity}
性格：${dean.personality}
核心治学理念：${coreViews.join('；')}
说话风格：${dean.speakingStyle}

你正在与一位来访的读者交谈。你博览群书、洞悉百家，以苏格拉底式的引导启发对方，而非直接给出答案。
规则：
- 称呼读者为"你"或"这位朋友"
- 可以介绍书院、推荐书目、探讨任何学问话题
- 回答控制在50~250字，不过于冗长
- 以问题结尾或延伸思考，保持对话的深度`;
    } else if (book && book.persona) {
      const p = book.persona;
      let coreViews: string[] = [];
      try { coreViews = JSON.parse(p.coreViews); } catch { coreViews = p.coreViews ? [p.coreViews] : []; }
      systemPrompt = `你是${book.author}，${p.identity}，用户正在基于${book.title}与您进行对话。
你的灵魂档案如下：
专业领域：${p.profession || '未知'}
社会地位：${p.socialStatus || '未知'}
你生活的年代：${book.era || '未知'}
性格特征：${p.personality}
核心观点：${coreViews.join('；')}
逻辑武器：${p.logicWeapons || '善用推理'}
交流风格：${p.communicationStyle || ''}
口头禅：${p.catchphrases || ''}
情绪态度：${p.emotions || ''}
知识边界：${p.knowledgeLimits}
说话风格：${p.speakingStyle}

${guestBookTitle ? `你被读者@提及，正在参与一场并非你自己著作的灵魂对话。对话的主线是关于另一本书，读者希望听取你的视角与见解。` : `你正在与一位现代读者进行"灵魂交流"——一场跨越时空的思想交流。`}
规则：
- 始终以第一人称作为${book.author}回答，保持年代身份和知识边界
- 与读者探讨书中的观点，或者向读者进一步解释，让他能够理解吸收内容
- 可以赞同、质疑或反驳用户观点，展开思辨
- 你无需在对话中老是强调和引用你的核心观点，但要让它们自然地体现在你的回答里
- 如果读者命中了你的喜好厌恶，或者触及了你的知识边界，你可以表现出相应的情绪态度
- 回答控制在20~300字以内，精炼有力
- 你不是在与用户对抗，而是在进行一场思想的共舞，既有碰撞也有融合。`;
    } else if (book) {
      systemPrompt = `你是${book.author}，《${book.title}》的作者，生活在${book.era}时期。
你正在与一位现代读者进行"灵魂对弈"——一场跨越时空的思想交锋。
请始终以第一人称作为${book.author}回答，回答控制在150字以内。`;
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // 日志：调用大模型请求
    const startTime = Date.now();
    console.log(`\n📤 [LLM 调用] ${new Date().toLocaleTimeString()}`);
    console.log(`   书籍: ${bookTitle || bookId || '未知'}`);
    // console.log(`   模型: ${config.model} @ ${config.provider}`);
    // console.log(`   Endpoint: ${config.endpoint}`);
    console.log(`   消息数: ${fullMessages.length} (含 system prompt)`);
    console.log(`   系统提示此: ${systemPrompt}`);
    console.log(`   用户最新: ${messages[messages.length - 1]?.content?.slice(0, 80) || '(无)'}`);

    // 请求 LLM，开启 stream
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: fullMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody: any = await response.json().catch(() => ({}));
      console.log(`   ❌ LLM 响应错误: HTTP ${response.status} - ${errBody.error?.message || '未知错误'}`);
      return res.status(response.status).json({
        code: 1,
        message: errBody.error?.message || `API 错误 ${response.status}`,
      });
    }

    // SSE 流式转发
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullReply = '';
    const reader = response.body as any;

    // node-fetch / undici 返回的是 ReadableStream
    if (reader && typeof reader[Symbol.asyncIterator] === 'function') {
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            }
          } catch {}
        }
      }
    } else {
      // 兜底：body 不可迭代，直接读取全部
      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      fullReply = content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      res.write('data: [DONE]\n\n');
    }

    // 前端负责保存消息（携带 conversationId），后端不重复写入
    const elapsed = Date.now() - startTime;
    console.log(`📥 [LLM 回复] 耗时 ${elapsed}ms，字数 ${fullReply.length}`);
    console.log(`   回复预览: ${fullReply.slice(0, 100)}${fullReply.length > 100 ? '...' : ''}`);

    res.end();
  } catch (e: any) {
    console.log(`   ❌ [LLM 异常] ${e.message}`);
    if (!res.headersSent) {
      res.status(500).json({ code: 1, message: e.message });
    } else {
      res.end();
    }
  }
});

// H5 前端接口：保存用户消息到聊天记录
app.post('/api/h5/chat-history', async (req, res) => {
  try {
    const { sessionId, conversationId, userId, role, content, speakerName, guestBookTitle } = req.body;
    if (!sessionId || !role || !content) {
      return res.status(400).json({ code: 1, message: '参数缺失' });
    }
    await prisma.chatMessage.create({
      data: { sessionId, conversationId: conversationId || null, userId: userId || null, role, content, speakerName: speakerName || null, guestBookTitle: guestBookTitle || null },
    });
    res.json({ code: 0 });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// H5 前端接口：获取聊天记录（返回最新 conversationId 对应的消息）
app.get('/api/h5/chat-history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { conversationId } = req.query as { conversationId?: string };

    let targetConvId: string | null = null;
    if (conversationId) {
      targetConvId = conversationId;
    } else {
      // 自动找最新一条带 conversationId 的消息
      const latest = await prisma.chatMessage.findFirst({
        where: { sessionId, conversationId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { conversationId: true },
      });
      targetConvId = latest?.conversationId ?? null;
    }

    const where = targetConvId
      ? { sessionId, conversationId: targetConvId }
      : { sessionId }; // 旧数据无 conversationId，回退到全量

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json({ code: 0, data: messages, conversationId: targetConvId });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// H5 前端接口：清空某会话聊天记录
app.delete('/api/h5/chat-history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { conversationId } = req.query as { conversationId?: string };
    const where = conversationId ? { sessionId, conversationId } : { sessionId };
    await prisma.chatMessage.deleteMany({ where });
    res.json({ code: 0, message: '已清空' });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// H5 前端接口：获取有聊天记录的会话列表（按最后聊天时间倒序）
app.get('/api/h5/chat-sessions', async (req, res) => {
  try {
    const { userId } = req.query as { userId?: string };
    const where = userId ? { userId } : {};
    const groups = await prisma.chatMessage.groupBy({
      by: ['sessionId'],
      where,
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    const sessions = groups.map(g => ({
      sessionId: g.sessionId,
      lastChatAt: g._max.createdAt,
      msgCount: g._count.id,
    }));
    res.json({ code: 0, data: sessions });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===================== 院长配置 =====================
const DEAN_DEFAULT = {
  name: '太虚院长',
  title: '太虚书院·院长',
  identity: '太虚书院的守护者，贯通古今、融汇百家的学者，博览古典群籍，深谙各家思想精髓',
  personality: '温和睿智、博学多识，以苏格拉底式的引导见长，善于通过提问激发学生自己找到答案',
  coreViews: JSON.stringify(['博览群书，融会贯通', '学问在于探索，不在于记诵', '真正的智慧是知道自己的无知', '每本书都是一扇通向另一个心灵的窗']),
  speakingStyle: '温文尔雅，善于引经据典，以问代答，启发式教学，言辞从容而深邃',
  openingQuestion: '太虚书院欢迎你。你今日踏入此院，所求何事？是想探讨某位先贤的思想，还是心中已有疑惑待解？',
  soulColor: '#c8a96e',
};

app.get('/api/h5/dean', async (_req, res) => {
  try {
    let dean = await prisma.deanConfig.findFirst({ where: { isActive: true } });
    if (!dean) {
      // 首次访问自动初始化
      dean = await prisma.deanConfig.create({ data: DEAN_DEFAULT });
    }
    res.json({ code: 0, data: dean });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

app.put('/api/dean', async (req, res) => {
  try {
    const { name, title, identity, personality, coreViews, speakingStyle, openingQuestion, soulColor } = req.body;
    let dean = await prisma.deanConfig.findFirst();
    if (dean) {
      dean = await prisma.deanConfig.update({
        where: { id: dean.id },
        data: { name, title, identity, personality, coreViews, speakingStyle, openingQuestion, soulColor },
      });
    } else {
      dean = await prisma.deanConfig.create({
        data: { name, title, identity, personality, coreViews, speakingStyle, openingQuestion, soulColor },
      });
    }
    res.json({ code: 0, data: dean });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

app.get('/api/dean', async (_req, res) => {
  try {
    const dean = await prisma.deanConfig.findFirst();
    res.json({ code: 0, data: dean || DEAN_DEFAULT });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===================== 太虚笔谈 =====================
// 生成笔谈
app.post('/api/h5/notes/generate', async (req, res) => {
  try {
    // 取对话记录（优先按 conversationId 筛选，保证生成本次对话的笔谈）
    const { sessionId, bookTitle, conversationId, userId } = req.body;
    if (!sessionId) return res.status(400).json({ code: 1, message: '参数缺失' });

    const config = await prisma.lLMConfig.findFirst({ where: { isActive: true } });
    if (!config) return res.status(400).json({ code: 1, message: '未配置大模型' });

    const msgWhere = conversationId
      ? { sessionId, conversationId }
      : { sessionId };
    const msgs = await prisma.chatMessage.findMany({
      where: msgWhere,
      orderBy: { createdAt: 'asc' },
      take: 60,
    });
    if (msgs.length < 2) return res.status(400).json({ code: 1, message: '对话内容不足，无法生成笔谈' });

    // 查找书名对应的作者名，用于在摘录中显示
    const cleanBookTitle = (bookTitle || sessionId).replace(/《|》/g, '');
    let authorName = cleanBookTitle;
    try {
      const bookRecord = await prisma.book.findFirst({ where: { title: { contains: cleanBookTitle } }, select: { author: true } });
      if (bookRecord?.author) authorName = bookRecord.author;
    } catch {}

    const dialogText = msgs.map((m: { role: string; speakerName: string | null; content: string }) => {
      if (m.role === 'user') return `读者: ${m.content}`;
      if (m.role === 'guest') return `${m.speakerName || '访客先贤'}: ${m.content}`;
      return `${authorName}: ${m.content}`;
    }).join('\n');

    const prompt = `你是一位学识渊博的太虚书院笔谈总结助手。请根据以下对话内容，完成三个任务：

【对话内容】
${dialogText}

【任务一：生成笔谈】
请生成一篇精炼的笔谈（知识点总结），要求：
- 300字以内
- 提炼出本次对话中读者探讨的核心知识点和思想洞见
- 以"今日笔谈"开头，文风典雅，如古人记事
- 体现读者的思考与收获

【任务二：表现评分】
请根据读者（"读者:"行）在对话中的表现，从以下维度给出1-5分：
- 是否有深度思考（而非只是简单提问）
- 是否有自己的观点或见解
- 是否能与先贤产生思想碰撞
- 参与度和积极性

【任务三：发言者观点总结（用于分享图）】
对本次对话中每位发言者（读者、${authorName}，以及出现的访客先贤）各自综合整理一条总结，要求：
- 每人只出一条，涵盖其在本次对话中的核心观点、思想精华和主要论点
- 在忠实原意的基础上进行文学润色，使语言典雅有力、富有哲思，避免平铺直叙
- 每人的 content 字数不少于100字，务必充分展现其思想深度，不得省略重要观点
- speaker：发言者名称（读者写"读者"，先贤写"${authorName}"，访客先贤写其姓名）
- role：读者写 "user"，先贤和访客先贤写 "author"
- 顺序：读者在前，${authorName}在后，其他访客依次排列

请严格按照以下JSON格式返回（不要有任何其他内容）：
{"summary":"笔谈内容...","score":3,"highlights":[{"speaker":"读者","role":"user","content":"（100字以上的读者观点总结）"},{"speaker":"${authorName}","role":"author","content":"（100字以上的先贤观点总结）"}]}`;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1600,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err: any = await response.json().catch(() => ({}));
      return res.status(500).json({ code: 1, message: err.error?.message || '大模型调用失败' });
    }

    const data: any = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';

    let summary = '今日笔谈：对话内容丰富，思维活跃，与先贤深入探讨了相关思想。';
    let score = 3;
    let highlights = '[]';
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary || summary;
        score = Math.max(1, Math.min(5, parseInt(parsed.score) || 3));
        if (Array.isArray(parsed.highlights)) {
          highlights = JSON.stringify(parsed.highlights);
        }
      }
    } catch {}

    const note = await prisma.noteEntry.create({
      data: { sessionId, conversationId: conversationId || null, bookTitle: bookTitle || sessionId, summary, score, highlights, userId: userId || null },
    });

    res.json({ code: 0, data: note });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 获取笔谈列表
app.get('/api/h5/notes', async (req, res) => {
  try {
    const { userId } = req.query as { userId?: string };
    const where = userId ? { userId } : {};
    const notes = await prisma.noteEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, data: notes });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 删除笔谈
app.delete('/api/h5/notes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ code: 1, message: '参数错误' });
    await prisma.noteEntry.delete({ where: { id } });
    res.json({ code: 0 });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 检查某会话（或某次对话）是否已有笔谈，以及是否有笔谈后的新消息
app.get('/api/h5/notes/check/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { conversationId } = req.query as { conversationId?: string };
    const msgWhere = conversationId ? { sessionId, conversationId } : { sessionId };
    const noteWhere = conversationId ? { sessionId, conversationId } : { sessionId };

    const [lastMsg, lastNote] = await Promise.all([
      prisma.chatMessage.findFirst({ where: msgWhere, orderBy: { createdAt: 'desc' } }),
      prisma.noteEntry.findFirst({ where: noteWhere, orderBy: { createdAt: 'desc' } }),
    ]);

    // hasNote: 本次对话已有笔谈
    const hasNote = !!lastNote;
    // hasNewMessages: 笔谈之后又有了新消息
    const hasNewMessages = !!(lastMsg && lastNote && lastMsg.createdAt > lastNote.createdAt);
    // hasUnnotedChat: 有对话但还没有笔谈
    const hasUnnotedChat = !!(lastMsg && !lastNote);

    res.json({ code: 0, data: { hasNote, hasNewMessages, hasUnnotedChat } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ===================== 用户认证 =====================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

app.post('/api/h5/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password) return res.status(400).json({ code: 1, message: '用户名和密码不能为空' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ code: 1, message: '用户名长度3~20个字符' });
    if (password.length < 6) return res.status(400).json({ code: 1, message: '密码不能少于6位' });
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) return res.status(400).json({ code: 1, message: '用户名只允许字母、数字、下划线和中文' });
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ code: 1, message: '用户名已被使用' });
    const hash = await bcrypt.hash(password, 10);
    // generate unique invite code
    let inviteCode = generateInviteCode();
    let tries = 0;
    while (tries < 5) {
      const clash = await prisma.user.findFirst({ where: { inviteCode } });
      if (!clash) break;
      inviteCode = generateInviteCode(); tries++;
    }
    // handle invite tracking: if caller supplies an inviterCode
    const { inviterCode, fingerprint: regFingerprint } = req.body;
    const user = await prisma.user.create({ data: { username, password: hash, nickname: nickname || null, inviteCode } });
    if (inviterCode) {
      // Try to update the existing visit record (fingerprint match), otherwise create a new one
      const existingVisit = regFingerprint
        ? await prisma.invitation.findFirst({
            where: { inviterCode, fingerprint: regFingerprint, inviteeId: null },
          })
        : null;
      if (existingVisit) {
        prisma.invitation.update({
          where: { id: existingVisit.id },
          data: { inviteeId: user.id },
        }).catch(() => {});
      } else {
        prisma.invitation.create({
          data: { inviterCode, fingerprint: regFingerprint || null, inviteeId: user.id },
        }).catch(() => {});
      }
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ code: 0, data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, inviteCode: user.inviteCode } } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

app.post('/api/h5/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ code: 1, message: '用户名和密码不能为空' });
    let user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(400).json({ code: 1, message: '用户名或密码错误' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ code: 1, message: '用户名或密码错误' });
    // backfill inviteCode for existing users that predate the feature
    if (!user.inviteCode) {
      let code = generateInviteCode();
      for (let i = 0; i < 5; i++) {
        const clash = await prisma.user.findFirst({ where: { inviteCode: code } });
        if (!clash) break;
        code = generateInviteCode();
      }
      user = await prisma.user.update({ where: { id: user.id }, data: { inviteCode: code } });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ code: 0, data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, inviteCode: user.inviteCode } } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 修改昵称（需要登录）
app.put('/api/h5/auth/nickname', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ code: 1, message: '未登录' });
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { id: number };
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length === 0) return res.status(400).json({ code: 1, message: '昵称不能为空' });
    await prisma.user.update({ where: { id: payload.id }, data: { nickname: nickname.trim() } });
    res.json({ code: 0 });
  } catch {
    res.status(401).json({ code: 1, message: '认证失败' });
  }
});

// 获取用户统计（笔谈数 + 累计分值）
app.get('/api/h5/user/stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ code: 1, message: '未登录' });
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { id: number; username: string };
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(404).json({ code: 1, message: '用户不存在' });
    const userId = `user_${payload.id}`;
    const notes = await prisma.noteEntry.findMany({ where: { userId }, select: { score: true } });
    const noteCount = notes.length;
    const totalScore = notes.reduce((s: number, n: { score: number }) => s + n.score, 0);
    const inviteCount = user.inviteCode
      ? await prisma.invitation.count({ where: { inviterCode: user.inviteCode } })
      : 0;
    res.json({ code: 0, data: { id: user.id, username: user.username, nickname: user.nickname, inviteCode: user.inviteCode, noteCount, totalScore, inviteCount } });
  } catch {
    res.status(401).json({ code: 1, message: '认证失败' });
  }
});

// 获取访客消息限制配置
// 记录邀请访问（扫码打开分享链接时调用）
app.post('/api/h5/invite/visit', async (req, res) => {
  try {
    const { code, fingerprint } = req.body;
    if (!code) return res.status(400).json({ code: 1, message: '参数缺失' });
    const inviter = await prisma.user.findFirst({ where: { inviteCode: code } });
    if (!inviter) return res.status(404).json({ code: 1, message: '邀请码无效' });
    await prisma.invitation.create({ data: { inviterCode: code, fingerprint: fingerprint || null } });
    res.json({ code: 0 });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

app.get('/api/h5/guest/limit', async (_req, res) => {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: GUEST_LIMIT_KEY } });
    const limit = cfg ? parseInt(cfg.value) || GUEST_LIMIT_DEFAULT : GUEST_LIMIT_DEFAULT;
    res.json({ code: 0, data: { limit } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 获取访客已发消息数
app.get('/api/h5/guest/count/:fingerprint', async (req, res) => {
  try {
    const { fingerprint } = req.params;
    const count = await prisma.chatMessage.count({
      where: { userId: fingerprint, role: 'user' },
    });
    res.json({ code: 0, data: { count } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 管理后台：查看/设置访客消息限制
app.get('/api/guest/limit', async (_req, res) => {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: GUEST_LIMIT_KEY } });
    res.json({ code: 0, data: { limit: cfg ? parseInt(cfg.value) || GUEST_LIMIT_DEFAULT : GUEST_LIMIT_DEFAULT } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

app.put('/api/guest/limit', async (req, res) => {
  try {
    const { limit } = req.body;
    const value = String(Math.max(0, parseInt(limit) || GUEST_LIMIT_DEFAULT));
    await prisma.appConfig.upsert({
      where: { key: GUEST_LIMIT_KEY },
      update: { value },
      create: { key: GUEST_LIMIT_KEY, value },
    });
    res.json({ code: 0, data: { limit: parseInt(value) } });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 生产环境：托管前端静态文件（Vite build 输出）
const frontendDist = path.join(__dirname, '../public');
app.use(express.static(frontendDist));
// SPA fallback — 所有非 API 路由返回 index.html
app.get(/^(?!\/api|\/admin).*/, (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 太虚书院后台服务已启动: http://localhost:${PORT}`);
  console.log(`📋 管理后台: http://localhost:${PORT}/admin`);
  console.log(`📚 书籍API: http://localhost:${PORT}/api/h5/books`);
});

// 优雅关闭，避免 ts-node-dev 重启时端口冲突
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
