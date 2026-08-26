import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('✦'),
  content: text('content').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['selection', 'general'] }).notNull(),
    quote: text('quote'),
    comment: text('comment').notNull(),
    startOffset: integer('start_offset'),
    endOffset: integer('end_offset'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_comments_project_id').on(table.projectId)],
);

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_versions_project_id').on(table.projectId)],
);

export type ProjectRecord = typeof projects.$inferSelect;
export type CommentRecord = typeof comments.$inferSelect;
export type VersionRecord = typeof versions.$inferSelect;
