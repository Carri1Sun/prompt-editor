import { getProjectBundle, updateProjectContent } from '@/db/store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const bundle = await getProjectBundle(id);
    if (!bundle) return Response.json({ error: '项目不存在' }, { status: 404 });
    return Response.json(bundle);
  } catch (error) {
    console.error('Unable to load project', error);
    return Response.json({ error: '暂时无法读取项目' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { content?: unknown };
    if (typeof body.content !== 'string' || body.content.length > 500_000) {
      return Response.json({ error: 'Prompt 内容无效或过长' }, { status: 400 });
    }
    const project = await updateProjectContent(id, body.content);
    if (!project) return Response.json({ error: '项目不存在' }, { status: 404 });
    return Response.json({ project });
  } catch (error) {
    console.error('Unable to update project', error);
    return Response.json({ error: '保存失败，请稍后重试' }, { status: 500 });
  }
}
