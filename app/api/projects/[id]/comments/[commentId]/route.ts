import { deleteComment } from '@/db/store';

type Context = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id, commentId } = await context.params;
    const deleted = await deleteComment(id, commentId);
    if (!deleted) return Response.json({ error: '批注不存在' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Unable to delete comment', error);
    return Response.json({ error: '删除批注失败' }, { status: 500 });
  }
}
