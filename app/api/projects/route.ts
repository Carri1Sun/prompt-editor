import { createProject, listProjects } from '@/db/store';

export async function GET() {
  try {
    return Response.json({ projects: await listProjects() });
  } catch (error) {
    console.error('Unable to list projects', error);
    return Response.json({ error: '暂时无法读取项目列表' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; description?: string; icon?: string };
    const project = await createProject(body);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Unable to create project', error);
    return Response.json({ error: '项目创建失败，请稍后重试' }, { status: 500 });
  }
}
