import { turso } from "../config/db.js";
import { newId } from "../utils/id.js";
import { nowISO } from "../utils/time.js";

export type TagRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TagSuggestionScope = "todo" | "note";

export type TagSuggestionRow = {
  id: string;
  name: string;
  color: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: Record<string, unknown>): TagRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  name: row.name as string,
  color: row.color as string,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

const mapSuggestionRow = (row: Record<string, unknown>): TagSuggestionRow => ({
  id: row.id as string,
  name: row.name as string,
  color: row.color as string,
  usage_count: Number(row.usage_count),
  last_used_at: (row.last_used_at as string | null) ?? null,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
});

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const createTag = async (
  userId: string,
  name: string,
  color = "#888888"
): Promise<TagRow> => {
  const id = newId();
  const now = nowISO();
  await turso.execute({
    sql: `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, name, color, now, now],
  });
  const row = await getTagById(id, userId);
  if (!row) throw new Error("createTag: row missing after insert");
  return row;
};

export const getTagById = async (
  id: string,
  userId: string
): Promise<TagRow | null> => {
  const res = await turso.execute({
    sql: "SELECT * FROM tags WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    args: [id, userId],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const findTagByName = async (
  userId: string,
  name: string
): Promise<TagRow | null> => {
  const res = await turso.execute({
    sql: "SELECT * FROM tags WHERE user_id = ? AND name = ? AND deleted_at IS NULL",
    args: [userId, name],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const findOrCreateByName = async (
  userId: string,
  name: string,
  color?: string
): Promise<TagRow> => {
  const existing = await findTagByName(userId, name);
  if (existing) return existing;
  return createTag(userId, name, color);
};

export const listTagsByUser = async (userId: string): Promise<TagRow[]> => {
  const res = await turso.execute({
    sql: "SELECT * FROM tags WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC",
    args: [userId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapRow);
};

export const listTagSuggestions = async (
  userId: string,
  opts: {
    scope: TagSuggestionScope;
    limit: number;
    q?: string;
  }
): Promise<TagSuggestionRow[]> => {
  const source =
    opts.scope === "todo"
      ? {
          junctionTable: "todo_tags",
          junctionAlias: "tt",
          parentTable: "todos",
          parentAlias: "td",
          parentIdColumn: "todo_id",
        }
      : {
          junctionTable: "note_tags",
          junctionAlias: "nt",
          parentTable: "notes",
          parentAlias: "n",
          parentIdColumn: "note_id",
        };

  const args: (string | number)[] = [userId, userId];
  const nameFilter = opts.q ? "AND g.name LIKE ? ESCAPE '\\'" : "";
  if (opts.q) {
    args.push(`%${escapeLike(opts.q)}%`);
  }
  args.push(opts.limit);

  const res = await turso.execute({
    sql: `SELECT
            g.id,
            g.name,
            g.color,
            g.created_at,
            g.updated_at,
            COUNT(${source.junctionAlias}.${source.parentIdColumn}) AS usage_count,
            MAX(${source.parentAlias}.updated_at) AS last_used_at
          FROM tags g
          JOIN ${source.junctionTable} ${source.junctionAlias}
            ON ${source.junctionAlias}.tag_id = g.id
          JOIN ${source.parentTable} ${source.parentAlias}
            ON ${source.parentAlias}.id = ${source.junctionAlias}.${source.parentIdColumn}
          WHERE g.user_id = ?
            AND g.deleted_at IS NULL
            AND ${source.parentAlias}.user_id = ?
            AND ${source.parentAlias}.deleted_at IS NULL
            ${nameFilter}
          GROUP BY g.id, g.name, g.color, g.created_at, g.updated_at
          ORDER BY usage_count DESC, last_used_at DESC, g.name COLLATE NOCASE ASC
          LIMIT ?`,
    args,
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapSuggestionRow);
};

export const softDeleteTag = async (
  id: string,
  userId: string
): Promise<boolean> => {
  const now = nowISO();
  const res = await turso.execute({
    sql: "UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    args: [now, now, id, userId],
  });
  return res.rowsAffected > 0;
};
