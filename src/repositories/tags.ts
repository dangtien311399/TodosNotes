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

export type TagListScope = "todo" | "note" | "all";

export type TagListRow = TagRow & {
  usage_count: number;
  last_used_at: string | null;
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

const mapListRow = (row: Record<string, unknown>): TagListRow => ({
  ...mapRow(row),
  usage_count: Number(row.usage_count ?? 0),
  last_used_at: (row.last_used_at as string | null) ?? null,
});

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

export class TagRepoError extends Error {
  constructor(public code: "duplicate" | "not_found") {
    super(code);
  }
}

export const normalizeTagName = (name: string): string =>
  name.trim().replace(/\s+/g, " ");

export const createTag = async (
  userId: string,
  name: string,
  color = "#888888"
): Promise<TagRow> => {
  const id = newId();
  const now = nowISO();
  const normalizedName = normalizeTagName(name);
  await turso.execute({
    sql: `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, normalizedName, color, now, now],
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
  const normalizedName = normalizeTagName(name);
  const res = await turso.execute({
    sql: `SELECT * FROM tags
          WHERE user_id = ?
            AND name = ? COLLATE NOCASE
            AND deleted_at IS NULL`,
    args: [userId, normalizedName],
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

export const listTagsByUser = async (
  userId: string,
  opts: { scope?: TagListScope; limit?: number; q?: string } = {}
): Promise<TagListRow[]> => {
  const scope = opts.scope ?? "all";
  const args: (string | number)[] = [userId];
  const nameFilter = opts.q ? "AND g.name LIKE ? ESCAPE '\\'" : "";
  if (opts.q) args.push(`%${escapeLike(normalizeTagName(opts.q))}%`);
  args.push(opts.limit ?? 100);

  if (scope === "todo") {
    const res = await turso.execute({
      sql: `SELECT
              g.*,
              COUNT(t.id) AS usage_count,
              MAX(t.updated_at) AS last_used_at
            FROM tags g
            LEFT JOIN todo_tags tt ON tt.tag_id = g.id
            LEFT JOIN todos t
              ON t.id = tt.todo_id
             AND t.user_id = g.user_id
             AND t.deleted_at IS NULL
            WHERE g.user_id = ?
              AND g.deleted_at IS NULL
              ${nameFilter}
            GROUP BY g.id
            ORDER BY usage_count DESC, last_used_at DESC, g.name COLLATE NOCASE ASC
            LIMIT ?`,
      args,
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(mapListRow);
  }

  if (scope === "note") {
    const res = await turso.execute({
      sql: `SELECT
              g.*,
              COUNT(n.id) AS usage_count,
              MAX(n.updated_at) AS last_used_at
            FROM tags g
            LEFT JOIN note_tags nt ON nt.tag_id = g.id
            LEFT JOIN notes n
              ON n.id = nt.note_id
             AND n.user_id = g.user_id
             AND n.deleted_at IS NULL
            WHERE g.user_id = ?
              AND g.deleted_at IS NULL
              ${nameFilter}
            GROUP BY g.id
            ORDER BY usage_count DESC, last_used_at DESC, g.name COLLATE NOCASE ASC
            LIMIT ?`,
      args,
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(mapListRow);
  }

  const res = await turso.execute({
    sql: `SELECT
            g.*,
            (
              COUNT(DISTINCT t.id) + COUNT(DISTINCT n.id)
            ) AS usage_count,
            MAX(COALESCE(t.updated_at, n.updated_at)) AS last_used_at
          FROM tags g
          LEFT JOIN todo_tags tt ON tt.tag_id = g.id
          LEFT JOIN todos t
            ON t.id = tt.todo_id
           AND t.user_id = g.user_id
           AND t.deleted_at IS NULL
          LEFT JOIN note_tags nt ON nt.tag_id = g.id
          LEFT JOIN notes n
            ON n.id = nt.note_id
           AND n.user_id = g.user_id
           AND n.deleted_at IS NULL
          WHERE g.user_id = ?
            AND g.deleted_at IS NULL
            ${nameFilter}
          GROUP BY g.id
          ORDER BY usage_count DESC, last_used_at DESC, g.name COLLATE NOCASE ASC
          LIMIT ?`,
    args,
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapListRow);
};

export const updateTag = async (
  id: string,
  userId: string,
  patch: { name?: string; color?: string }
): Promise<TagRow | null> => {
  const current = await getTagById(id, userId);
  if (!current) return null;

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    const normalizedName = normalizeTagName(patch.name);
    const existing = await findTagByName(userId, normalizedName);
    if (existing && existing.id !== id) throw new TagRepoError("duplicate");
    sets.push("name = ?");
    args.push(normalizedName);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    args.push(patch.color);
  }

  if (sets.length === 0) return current;
  sets.push("updated_at = ?");
  args.push(nowISO(), id, userId);

  const res = await turso.execute({
    sql: `UPDATE tags SET ${sets.join(", ")}
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args,
  });
  if (res.rowsAffected === 0) return null;
  return getTagById(id, userId);
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
