import { createVersion } from '@/db/store';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { tag?: unknown; content?: unknown };
    if (typeof body.tag !== 'string' || !body.tag.trim() || body.tag.length > 80) {
      return Response.json({ error: '请填写 1–80 字的版本 Tag' }, { status: 400 });
    }
    if (typeof body.content !== 'string') return Response.json({ error: '版本内容无效' }, { status: 400 });
    const version = await createVersion(id, body.tag, body.content);
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      return Response.json({ error: '项目不存在' }, { status: 404 });
    }
    console.error('Unable to create version', error);
    return Response.json({ error: '版本记录失败' }, { status: 500 });
  }
}
