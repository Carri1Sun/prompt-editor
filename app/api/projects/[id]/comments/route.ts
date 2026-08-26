import { createComment } from '@/db/store';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      kind?: unknown;
      quote?: unknown;
      comment?: unknown;
      startOffset?: unknown;
      endOffset?: unknown;
    };
    if ((body.kind !== 'selection' && body.kind !== 'general') || typeof body.comment !== 'string' || !body.comment.trim()) {
      return Response.json({ error: '请填写批注内容' }, { status: 400 });
    }
    if (body.comment.length > 4_000) return Response.json({ error: '单条批注不能超过 4000 字' }, { status: 400 });
    if (body.kind === 'selection' && (
      typeof body.quote !== 'string' || !body.quote.trim() ||
      typeof body.startOffset !== 'number' || typeof body.endOffset !== 'number'
    )) {
      return Response.json({ error: '划线范围无效，请重新选择' }, { status: 400 });
    }
    const comment = await createComment({
      projectId: id,
      kind: body.kind,
      quote: typeof body.quote === 'string' ? body.quote : null,
      comment: body.comment,
      startOffset: typeof body.startOffset === 'number' ? body.startOffset : null,
      endOffset: typeof body.endOffset === 'number' ? body.endOffset : null,
    });
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('Unable to create comment', error);
    return Response.json({ error: '批注保存失败' }, { status: 500 });
  }
}
