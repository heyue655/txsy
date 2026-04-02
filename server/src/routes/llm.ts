import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// 获取所有大模型配置
router.get('/', async (_req, res) => {
  try {
    const configs = await prisma.lLMConfig.findMany({ orderBy: { createdAt: 'desc' } });
    // 脱敏 apiKey
    const masked = configs.map(c => ({
      ...c,
      apiKey: c.apiKey ? c.apiKey.slice(0, 6) + '****' + c.apiKey.slice(-4) : '',
    }));
    res.json({ code: 0, data: masked });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 新增配置
router.post('/', async (req, res) => {
  try {
    const { name, provider, endpoint, apiKey, model, temperature, maxTokens, isActive } = req.body;
    // 如果设为激活，先把其它的关闭
    if (isActive) {
      await prisma.lLMConfig.updateMany({ data: { isActive: false } });
    }
    const config = await prisma.lLMConfig.create({
      data: {
        name: name || '',
        provider: provider || 'openai',
        endpoint: endpoint || '',
        apiKey: apiKey || '',
        model: model || 'gpt-4o-mini',
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 2048,
        isActive: isActive || false,
      },
    });
    res.json({ code: 0, data: config });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 更新配置
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive, apiKey, ...rest } = req.body;
    // 如果设为激活，先把其它的关闭
    if (isActive) {
      await prisma.lLMConfig.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
    }
    // 如果 apiKey 包含 ****，说明是脱敏数据，不更新
    const data: any = { ...rest, isActive };
    if (apiKey && !apiKey.includes('****')) {
      data.apiKey = apiKey;
    }
    const config = await prisma.lLMConfig.update({ where: { id }, data });
    res.json({ code: 0, data: config });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 连通性测试
router.post('/:id/test', async (req, res) => {
  try {
    const config = await prisma.lLMConfig.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!config) return res.status(404).json({ code: 1, message: '配置不存在' });
    if (!config.endpoint || !config.apiKey) {
      return res.json({ code: 1, message: '请先填写 Endpoint 和 API Key' });
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: '你好，请回复"连通成功"四个字' }],
          max_tokens: 20,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.json({
          code: 1,
          message: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
          latency,
        });
      }

      const data: any = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      res.json({
        code: 0,
        message: '连通成功',
        latency,
        model: data.model || config.model,
        reply: reply.slice(0, 100),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;
      if (fetchErr.name === 'AbortError') {
        return res.json({ code: 1, message: '连接超时（15秒）', latency });
      }
      return res.json({ code: 1, message: fetchErr.message || '网络错误', latency });
    }
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

// 删除配置
router.delete('/:id', async (req, res) => {
  try {
    await prisma.lLMConfig.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ code: 0, message: '已删除' });
  } catch (e: any) {
    res.status(500).json({ code: 1, message: e.message });
  }
});

export default router;
