import { REVIEW_SYSTEM_PROMPT } from '@/lib/review-prompt';

type ReviewInputComment = {
  id: string;
  kind: 'selection' | 'general';
  quote: string | null;
  comment: string;
  startOffset: number | null;
  endOffset: number | null;
};

type RawSuggestion = {
  title?: unknown;
  original?: unknown;
  replacement?: unknown;
  reason?: unknown;
  commentIds?: unknown;
};

function extractJson(text: string) {
  const withoutFence = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('INVALID_AI_JSON');
  return JSON.parse(withoutFence.slice(start, end + 1)) as { summary?: unknown; suggestions?: unknown };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: unknown; comments?: unknown };
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return Response.json({ error: '请先写下 Prompt 再提交分析' }, { status: 400 });
    }
    if (body.prompt.length > 120_000) return Response.json({ error: 'Prompt 过长，请缩短后重试' }, { status: 400 });
    const prompt = body.prompt;
    const comments = Array.isArray(body.comments)
      ? (body.comments as ReviewInputComment[]).filter((item) => item && typeof item.comment === 'string')
      : [];

    const apiKey = process.env.QWEN_TOKEN_PLAN_API_KEY;
    const baseUrl = process.env.QWEN_BASE_URL;
    if (!apiKey || !baseUrl) {
      return Response.json({ error: 'Qwen Token Plan 尚未配置完整' }, { status: 503 });
    }

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen3.8-max',
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              task: '请审阅以下 Prompt，并结合批注给出可逐条采纳的局部修改建议。',
              originalPrompt: prompt,
              comments: comments.map((item) => ({
                id: item.id,
                type: item.kind,
                selectedText: item.quote,
                comment: item.comment,
                range: item.startOffset === null ? null : [item.startOffset, item.endOffset],
              })),
            }),
          },
        ],
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 4_000,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      console.error('Qwen request failed', response.status, await response.text());
      return Response.json({ error: `Qwen 分析暂时不可用（${response.status}）` }, { status: 502 });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('EMPTY_AI_RESPONSE');
    const parsed = extractJson(content);
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions as RawSuggestion[] : [];
    const suggestions = rawSuggestions
      .filter((item) =>
        typeof item.title === 'string' &&
        typeof item.original === 'string' &&
        typeof item.replacement === 'string' &&
        typeof item.reason === 'string' &&
        item.original.length > 0 &&
        prompt.includes(item.original),
      )
      .slice(0, 8)
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title as string,
        original: item.original as string,
        replacement: item.replacement as string,
        reason: item.reason as string,
        commentIds: Array.isArray(item.commentIds)
          ? item.commentIds.filter((id): id is string => typeof id === 'string')
          : [],
      }));

    return Response.json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : '审阅完成',
      suggestions,
      model: process.env.QWEN_MODEL || 'qwen3.8-max',
    });
  } catch (error) {
    console.error('Unable to analyze prompt', error);
    return Response.json({ error: 'AI 返回内容无法解析，请重新提交' }, { status: 502 });
  }
}
