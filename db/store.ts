import { env } from 'cloudflare:workers';

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = Omit<Project, 'content'> & { characterCount: number };

export type PromptComment = {
  id: string;
  projectId: string;
  kind: 'selection' | 'general';
  quote: string | null;
  comment: string;
  startOffset: number | null;
  endOffset: number | null;
  createdAt: string;
};

export type PromptVersion = {
  id: string;
  projectId: string;
  tag: string;
  content: string;
  createdAt: string;
};

let schemaReady: Promise<void> | null = null;

function getD1() {
  if (!env.DB) throw new Error('Prompt 数据库尚未连接');
  return env.DB;
}

async function initializeSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '✦',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('selection', 'general')),
      quote TEXT,
      comment TEXT NOT NULL,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id)'),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

async function readyDb() {
  if (!schemaReady) {
    schemaReady = initializeSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return getD1();
}

const projectColumns = `id, name, description, icon, content,
  created_at AS createdAt, updated_at AS updatedAt`;

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await readyDb();
  const result = await db
    .prepare(`SELECT id, name, description, icon,
      created_at AS createdAt, updated_at AS updatedAt,
      length(content) AS characterCount
      FROM projects ORDER BY updated_at DESC`)
    .all<ProjectSummary>();
  return result.results;
}

export async function createProject(input: {
  name?: string;
  description?: string;
  icon?: string;
  content?: string;
}): Promise<Project> {
  const db = await readyDb();
  const countResult = await db.prepare('SELECT COUNT(*) AS count FROM projects').first<{ count: number }>();
  const number = Number(countResult?.count ?? 0) + 1;
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name?.trim() || `prompt-${number}`,
    description: input.description?.trim() || '',
    icon: input.icon?.trim() || '✦',
    content: input.content || '',
    createdAt: now,
    updatedAt: now,
  };
  await db.prepare(`INSERT INTO projects
    (id, name, description, icon, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(project.id, project.name, project.description, project.icon, project.content, now, now)
    .run();
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await readyDb();
  return db.prepare(`SELECT ${projectColumns} FROM projects WHERE id = ?`).bind(id).first<Project>();
}

export async function getProjectBundle(id: string) {
  const db = await readyDb();
  const [project, commentsResult, versionsResult] = await Promise.all([
    db.prepare(`SELECT ${projectColumns} FROM projects WHERE id = ?`).bind(id).first<Project>(),
    db.prepare(`SELECT id, project_id AS projectId, kind, quote, comment,
      start_offset AS startOffset, end_offset AS endOffset, created_at AS createdAt
      FROM comments WHERE project_id = ? ORDER BY created_at DESC`).bind(id).all<PromptComment>(),
    db.prepare(`SELECT id, project_id AS projectId, tag, content, created_at AS createdAt
      FROM versions WHERE project_id = ? ORDER BY created_at DESC`).bind(id).all<PromptVersion>(),
  ]);
  if (!project) return null;
  return { project, comments: commentsResult.results, versions: versionsResult.results };
}

export async function updateProjectContent(id: string, content: string): Promise<Project | null> {
  const db = await readyDb();
  const now = new Date().toISOString();
  const result = await db.prepare('UPDATE projects SET content = ?, updated_at = ? WHERE id = ?')
    .bind(content, now, id)
    .run();
  if (!result.meta.changes) return null;
  return getProject(id);
}

export async function createComment(input: {
  projectId: string;
  kind: 'selection' | 'general';
  quote?: string | null;
  comment: string;
  startOffset?: number | null;
  endOffset?: number | null;
}): Promise<PromptComment> {
  const db = await readyDb();
  const item: PromptComment = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    kind: input.kind,
    quote: input.kind === 'selection' ? input.quote || null : null,
    comment: input.comment.trim(),
    startOffset: input.kind === 'selection' ? input.startOffset ?? null : null,
    endOffset: input.kind === 'selection' ? input.endOffset ?? null : null,
    createdAt: new Date().toISOString(),
  };
  await db.prepare(`INSERT INTO comments
    (id, project_id, kind, quote, comment, start_offset, end_offset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      item.id,
      item.projectId,
      item.kind,
      item.quote,
      item.comment,
      item.startOffset,
      item.endOffset,
      item.createdAt,
    )
    .run();
  return item;
}

export async function deleteComment(projectId: string, commentId: string) {
  const db = await readyDb();
  const result = await db.prepare('DELETE FROM comments WHERE id = ? AND project_id = ?')
    .bind(commentId, projectId)
    .run();
  return Boolean(result.meta.changes);
}

export async function createVersion(projectId: string, tag: string, content: string): Promise<PromptVersion> {
  const db = await readyDb();
  const project = await getProject(projectId);
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const version: PromptVersion = {
    id: crypto.randomUUID(),
    projectId,
    tag: tag.trim(),
    content,
    createdAt: new Date().toISOString(),
  };
  await db.prepare('INSERT INTO versions (id, project_id, tag, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(version.id, version.projectId, version.tag, version.content, version.createdAt)
    .run();
  return version;
}

export async function duplicateProject(projectId: string, versionId?: string): Promise<Project> {
  const db = await readyDb();
  const source = await getProject(projectId);
  if (!source) throw new Error('PROJECT_NOT_FOUND');
  let content = source.content;
  let suffix = '副本';
  if (versionId) {
    const version = await db.prepare('SELECT tag, content FROM versions WHERE id = ? AND project_id = ?')
      .bind(versionId, projectId)
      .first<{ tag: string; content: string }>();
    if (!version) throw new Error('VERSION_NOT_FOUND');
    content = version.content;
    suffix = `${version.tag} 副本`;
  }
  return createProject({
    name: `${source.name} · ${suffix}`,
    description: source.description,
    icon: source.icon,
    content,
  });
}
