import { duplicateProject } from '@/db/store';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { versionId?: unknown };
    const project = await duplicateProject(id, typeof body.versionId === 'string' ? body.versionId : undefined);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'VERSION_NOT_FOUND')) {
      return Response.json({ error: '要复制的版本不存在' }, { status: 404 });
    }
    console.error('Unable to duplicate project', error);
    return Response.json({ error: '创建副本失败' }, { status: 500 });
  }
}
