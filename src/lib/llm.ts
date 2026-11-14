// OpenAI 兼容接口的最小 LLM 客户端：只发 chat 请求、只收 JSON 对象。
// 任何失败统一抛 LLMError，由流水线决定降级策略。

export class LLMError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function llmConfigured(): boolean {
  return Boolean((process.env.LLM_API_KEY || '').trim());
}

function modelBody(system: string, user: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: process.env.LLM_MODEL || 'deepseek-flash',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
    max_tokens: Number(process.env.LLM_MAX_TOKENS) || 4096,
    stream: false,
  };
  // 允许注入供应商特有参数（思考模式开关等），由 LLM_EXTRA_BODY 环境变量控制
  const extra = (process.env.LLM_EXTRA_BODY || '').trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra);
      if (parsed && typeof parsed === 'object') Object.assign(body, parsed);
    } catch {
      // 非法 JSON 时忽略，保持默认请求体
    }
  }
  return body;
}

async function postChat(body: Record<string, unknown>): Promise<any> {
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 90000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${(process.env.LLM_API_KEY || '').trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new LLMError(`无法连接 LLM 服务：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMError(`LLM 服务返回 HTTP ${res.status}：${text.slice(0, 160)}`, res.status);
  }
  return (await res.json()) as any;
}

/**
 * 从 LLM 输出中提取完整 JSON 对象。
 * 容忍 ```json 代码块、解释文字，以及思考模型把推理过程混进正文的情况：
 * 用括号配对扫描出所有"平衡"的顶层 {...} 候选，从后往前逐个尝试解析
 * （思考模型的最终答案通常在推理之后，靠后候选优先）。
 */
export function extractJsonObject(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  }

  const candidates: string[] = [];
  if (t.startsWith('{')) candidates.push(t);

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) candidates.push(t.slice(start, i + 1));
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 继续尝试下一个候选
    }
  }
  throw new LLMError('LLM 输出中找不到可解析的 JSON 对象');
}

/** 一次 LLM 调用，要求返回 JSON 对象。连接级失败自动重试一次。 */
export async function chatJson(system: string, user: string): Promise<Record<string, unknown>> {
  const key = (process.env.LLM_API_KEY || '').trim();
  if (!key) throw new LLMError('未配置 LLM_API_KEY');
  let payload: any;
  try {
    payload = await postChatWithRetry({
      ...modelBody(system, user),
      response_format: { type: 'json_object' },
    });
  } catch (e) {
    // 部分兼容网关不接受 response_format，去掉后重试一次
    if (e instanceof LLMError && e.status === 400) {
      payload = await postChatWithRetry(modelBody(system, user));
    } else {
      throw e;
    }
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LLMError('LLM 返回内容为空（可能被思考内容占满输出额度）');
  }
  return extractJsonObject(content);
}

/** 连接失败（非 HTTP 错误）时等待 1.5s 重试一次，吸收瞬态网络抖动。 */
async function postChatWithRetry(body: Record<string, unknown>): Promise<any> {
  try {
    return await postChat(body);
  } catch (e) {
    if (e instanceof LLMError && e.status === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return await postChat(body);
    }
    throw e;
  }
}