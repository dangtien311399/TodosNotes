import { turso } from "../config/db.js";
import { newId } from "../utils/id.js";
import { nowISO } from "../utils/time.js";
import type { TagRow } from "./tags.js";

export type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  type: "free" | "cornell";
  body: string | null;
  cornell_cue: string | null;
  cornell_summary: string | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const NOTE_COLUMNS =
  "id, user_id, title, type, body, cornell_cue, cornell_summary, is_pinned, created_at, updated_at, deleted_at";

const mapRow = (row: Record<string, unknown>): NoteRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  title: row.title as string,
  type: row.type as NoteRow["type"],
  body: (row.body as string | null) ?? null,
  cornell_cue: (row.cornell_cue as string | null) ?? null,
  cornell_summary: (row.cornell_summary as string | null) ?? null,
  is_pinned: Number(row.is_pinned),
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

const mapTagRow = (row: Record<string, unknown>): TagRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  name: row.name as string,
  color: row.color as string,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

// ============================================================
// Read
// ============================================================

export const getNoteById = async (id: string): Promise<NoteRow | null> => {
  const res = await turso.execute({
    sql: `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ?`,
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const getNoteByIdScoped = async (
  id: string,
  userId: string
): Promise<NoteRow | null> => {
  const res = await turso.execute({
    sql: `SELECT ${NOTE_COLUMNS} FROM notes
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args: [id, userId],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

// ============================================================
// Cursor pagination helpers
// ============================================================

type Cursor = { updated_at: string; id: string };

const encodeCursor = (c: Cursor): string =>
  Buffer.from(`${c.updated_at}|${c.id}`, "utf8").toString("base64url");

const decodeCursor = (raw: string): Cursor => {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const idx = decoded.indexOf("|");
  if (idx < 0) throw new Error("bad_cursor");
  const updated_at = decoded.slice(0, idx);
  const id = decoded.slice(idx + 1);
  if (!updated_at || !id) throw new Error("bad_cursor");
  return { updated_at, id };
};

// FTS5 query sanitization: split by whitespace, wrap each token "..." and
// append `*` to the last token for prefix search. Avoids user injecting
// MATCH operators (AND/OR/NEAR/NOT) accidentally.
const sanitizeFts = (q: string): string => {
  const tokens = q
    .replace(/["]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  const wrapped = tokens.map((t) => `"${t}"`);
  wrapped[wrapped.length - 1] = `${wrapped[wrapped.length - 1]}*`;
  return wrapped.join(" ");
};

// ============================================================
// List notes (filter + cursor + FTS)
// ============================================================

export type ListOpts = {
  cursor?: string;
  limit: number;
  type?: "free" | "cornell";
  pinned?: boolean;
  q?: string;
};

export type ListResult = {
  rows: NoteRow[];
  nextCursor: string | null;
};

export const listNotesByUser = async (
  userId: string,
  opts: ListOpts
): Promise<ListResult> => {
  const where: string[] = ["n.user_id = ?", "n.deleted_at IS NULL"];
  const args: (string | number)[] = [userId];
  let join = "";

  if (opts.type) {
    where.push("n.type = ?");
    args.push(opts.type);
  }
  if (typeof opts.pinned === "boolean") {
    where.push("n.is_pinned = ?");
    args.push(opts.pinned ? 1 : 0);
  }

  let orderBy = "n.updated_at DESC, n.id DESC";

  if (opts.q && opts.q.length > 0) {
    const ftsQuery = sanitizeFts(opts.q);
    if (ftsQuery.length > 0) {
      join = "JOIN notes_fts f ON n.id = f.note_id";
      where.push("notes_fts MATCH ?");
      args.push(ftsQuery);
      orderBy = "bm25(notes_fts), n.updated_at DESC, n.id DESC";
    }
  }

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    where.push("(n.updated_at < ? OR (n.updated_at = ? AND n.id < ?))");
    args.push(c.updated_at, c.updated_at, c.id);
  }

  const limitPlus = opts.limit + 1;
  args.push(limitPlus);

  const sql = `SELECT ${NOTE_COLUMNS.split(", ").map((c) => `n.${c}`).join(", ")}
               FROM notes n ${join}
               WHERE ${where.join(" AND ")}
               ORDER BY ${orderBy}
               LIMIT ?`;

  const res = await turso.execute({ sql, args });
  const rawRows = (res.rows as unknown as Record<string, unknown>[]).map(mapRow);

  let nextCursor: string | null = null;
  let rows = rawRows;
  if (rawRows.length > opts.limit) {
    rows = rawRows.slice(0, opts.limit);
    const last = rows[rows.length - 1];
    nextCursor = encodeCursor({ updated_at: last.updated_at, id: last.id });
  }
  return { rows, nextCursor };
};

// ============================================================
// Create / Update / Delete
// ============================================================

export type CreateNoteInput = {
  user_id: string;
  title: string;
  type: "free" | "cornell";
  body?: string | null;
  cornell_cue?: string | null;
  cornell_summary?: string | null;
  is_pinned?: boolean;
};

export const createNote = async (input: CreateNoteInput): Promise<NoteRow> => {
  const id = newId();
  const now = nowISO();
  await turso.execute({
    sql: `INSERT INTO notes
          (id, user_id, title, type, body, cornell_cue, cornell_summary, is_pinned, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.user_id,
      input.title,
      input.type,
      input.body ?? null,
      input.cornell_cue ?? null,
      input.cornell_summary ?? null,
      input.is_pinned ? 1 : 0,
      now,
      now,
    ],
  });
  const row = await getNoteById(id);
  if (!row) throw new Error("createNote: row missing after insert");
  return row;
};

export type UpdateNotePatch = {
  title?: string;
  type?: "free" | "cornell";
  body?: string | null;
  cornell_cue?: string | null;
  cornell_summary?: string | null;
  is_pinned?: boolean;
};

export const updateNote = async (
  id: string,
  userId: string,
  patch: UpdateNotePatch
): Promise<NoteRow | null> => {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    args.push(patch.title);
  }
  if (patch.type !== undefined) {
    sets.push("type = ?");
    args.push(patch.type);
  }
  if (patch.body !== undefined) {
    sets.push("body = ?");
    args.push(patch.body);
  }
  if (patch.cornell_cue !== undefined) {
    sets.push("cornell_cue = ?");
    args.push(patch.cornell_cue);
  }
  if (patch.cornell_summary !== undefined) {
    sets.push("cornell_summary = ?");
    args.push(patch.cornell_summary);
  }
  if (patch.is_pinned !== undefined) {
    sets.push("is_pinned = ?");
    args.push(patch.is_pinned ? 1 : 0);
  }
  if (sets.length === 0) {
    return getNoteByIdScoped(id, userId);
  }
  sets.push("updated_at = ?");
  args.push(nowISO());
  args.push(id, userId);

  const res = await turso.execute({
    sql: `UPDATE notes SET ${sets.join(", ")}
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args,
  });
  if (res.rowsAffected === 0) return null;
  return getNoteByIdScoped(id, userId);
};

// Soft delete: userId tùy chọn để admin web không cần truyền (giữ tương thích cũ)
export const softDeleteNote = async (
  id: string,
  userId?: string
): Promise<boolean> => {
  const now = nowISO();
  const sql = userId
    ? "UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
    : "UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL";
  const args = userId ? [now, now, id, userId] : [now, now, id];
  const res = await turso.execute({ sql, args });
  return res.rowsAffected > 0;
};

// ============================================================
// Note ↔ Note links (Zettelkasten)
// ============================================================

export type NoteLinkRow = {
  id: string;
  source_note_id: string;
  target_note_id: string;
  label: string | null;
  created_at: string;
};

export type OutgoingLinkRow = NoteLinkRow & { target_title: string };
export type IncomingLinkRow = NoteLinkRow & { source_title: string };

const isUniqueViolation = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE/i.test(msg);
};

export class RepoError extends Error {
  constructor(public code: "not_found" | "duplicate") {
    super(code);
  }
}

export const addNoteLink = async (
  sourceId: string,
  targetId: string,
  userId: string,
  label: string | null
): Promise<NoteLinkRow> => {
  const id = newId();
  const now = nowISO();
  try {
    const res = await turso.execute({
      sql: `INSERT INTO note_links (id, source_note_id, target_note_id, label, created_at)
            SELECT ?, s.id, t.id, ?, ?
            FROM notes s, notes t
            WHERE s.id = ? AND s.user_id = ? AND s.deleted_at IS NULL
              AND t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`,
      args: [id, label, now, sourceId, userId, targetId, userId],
    });
    if (res.rowsAffected === 0) {
      throw new RepoError("not_found");
    }
  } catch (e) {
    if (e instanceof RepoError) throw e;
    if (isUniqueViolation(e)) throw new RepoError("duplicate");
    throw e;
  }
  return { id, source_note_id: sourceId, target_note_id: targetId, label, created_at: now };
};

export const removeNoteLink = async (
  sourceId: string,
  targetId: string,
  userId: string
): Promise<boolean> => {
  const res = await turso.execute({
    sql: `DELETE FROM note_links
          WHERE source_note_id = ? AND target_note_id = ?
            AND source_note_id IN (SELECT id FROM notes WHERE user_id = ?)`,
    args: [sourceId, targetId, userId],
  });
  return res.rowsAffected > 0;
};

export const listOutgoingLinks = async (
  noteId: string,
  userId: string
): Promise<OutgoingLinkRow[]> => {
  const res = await turso.execute({
    sql: `SELECT l.id, l.source_note_id, l.target_note_id, l.label, l.created_at,
                 t.title AS target_title
          FROM note_links l
          JOIN notes s ON s.id = l.source_note_id
          JOIN notes t ON t.id = l.target_note_id
          WHERE l.source_note_id = ?
            AND s.user_id = ? AND s.deleted_at IS NULL
            AND t.deleted_at IS NULL
          ORDER BY l.created_at DESC`,
    args: [noteId, userId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    source_note_id: r.source_note_id as string,
    target_note_id: r.target_note_id as string,
    label: (r.label as string | null) ?? null,
    created_at: r.created_at as string,
    target_title: r.target_title as string,
  }));
};

export const listIncomingLinks = async (
  noteId: string,
  userId: string
): Promise<IncomingLinkRow[]> => {
  const res = await turso.execute({
    sql: `SELECT l.id, l.source_note_id, l.target_note_id, l.label, l.created_at,
                 s.title AS source_title
          FROM note_links l
          JOIN notes t ON t.id = l.target_note_id
          JOIN notes s ON s.id = l.source_note_id
          WHERE l.target_note_id = ?
            AND t.user_id = ? AND t.deleted_at IS NULL
            AND s.deleted_at IS NULL
          ORDER BY l.created_at DESC`,
    args: [noteId, userId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    source_note_id: r.source_note_id as string,
    target_note_id: r.target_note_id as string,
    label: (r.label as string | null) ?? null,
    created_at: r.created_at as string,
    source_title: r.source_title as string,
  }));
};

// ============================================================
// Note ↔ Todo links
// ============================================================

export type NoteTodoLinkRow = {
  id: string;
  note_id: string;
  todo_id: string;
  created_at: string;
};

export type LinkedTodoRow = {
  id: string;
  title: string;
  status: string;
};

export const addNoteTodoLink = async (
  noteId: string,
  todoId: string,
  userId: string
): Promise<NoteTodoLinkRow> => {
  const id = newId();
  const now = nowISO();
  try {
    const res = await turso.execute({
      sql: `INSERT INTO note_todo_links (id, note_id, todo_id, created_at)
            SELECT ?, n.id, t.id, ?
            FROM notes n, todos t
            WHERE n.id = ? AND n.user_id = ? AND n.deleted_at IS NULL
              AND t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`,
      args: [id, now, noteId, userId, todoId, userId],
    });
    if (res.rowsAffected === 0) throw new RepoError("not_found");
  } catch (e) {
    if (e instanceof RepoError) throw e;
    if (isUniqueViolation(e)) throw new RepoError("duplicate");
    throw e;
  }
  return { id, note_id: noteId, todo_id: todoId, created_at: now };
};

export const removeNoteTodoLink = async (
  noteId: string,
  todoId: string,
  userId: string
): Promise<boolean> => {
  const res = await turso.execute({
    sql: `DELETE FROM note_todo_links
          WHERE note_id = ? AND todo_id = ?
            AND note_id IN (SELECT id FROM notes WHERE user_id = ?)`,
    args: [noteId, todoId, userId],
  });
  return res.rowsAffected > 0;
};

export const listLinkedTodos = async (
  noteId: string,
  userId: string
): Promise<LinkedTodoRow[]> => {
  const res = await turso.execute({
    sql: `SELECT t.id, t.title, t.status
          FROM note_todo_links l
          JOIN notes n ON n.id = l.note_id
          JOIN todos t ON t.id = l.todo_id
          WHERE l.note_id = ?
            AND n.user_id = ? AND n.deleted_at IS NULL
            AND t.deleted_at IS NULL
          ORDER BY l.created_at DESC`,
    args: [noteId, userId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    status: r.status as string,
  }));
};

// ============================================================
// Note ↔ Tag attach/detach
// ============================================================

export const attachTagToNote = async (
  noteId: string,
  tagId: string,
  userId: string
): Promise<boolean> => {
  try {
    const res = await turso.execute({
      sql: `INSERT INTO note_tags (note_id, tag_id)
            SELECT n.id, g.id
            FROM notes n, tags g
            WHERE n.id = ? AND n.user_id = ? AND n.deleted_at IS NULL
              AND g.id = ? AND g.user_id = ? AND g.deleted_at IS NULL`,
      args: [noteId, userId, tagId, userId],
    });
    if (res.rowsAffected === 0) throw new RepoError("not_found");
    return true;
  } catch (e) {
    if (e instanceof RepoError) throw e;
    if (isUniqueViolation(e)) return false; // already attached → idempotent
    throw e;
  }
};

export const detachTagFromNote = async (
  noteId: string,
  tagId: string,
  userId: string
): Promise<boolean> => {
  const res = await turso.execute({
    sql: `DELETE FROM note_tags
          WHERE note_id = ? AND tag_id = ?
            AND note_id IN (SELECT id FROM notes WHERE user_id = ?)`,
    args: [noteId, tagId, userId],
  });
  return res.rowsAffected > 0;
};

export const listNoteTags = async (noteId: string): Promise<TagRow[]> => {
  const res = await turso.execute({
    sql: `SELECT g.id, g.user_id, g.name, g.color, g.created_at, g.updated_at, g.deleted_at
          FROM note_tags nt
          JOIN tags g ON g.id = nt.tag_id
          WHERE nt.note_id = ? AND g.deleted_at IS NULL
          ORDER BY g.name ASC`,
    args: [noteId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapTagRow);
};

// ============================================================
// Full detail with relations (single call for mobile GET /:id)
// ============================================================

export type NoteWithRelations = {
  note: NoteRow;
  tags: TagRow[];
  outgoing: OutgoingLinkRow[];
  incoming: IncomingLinkRow[];
  todos: LinkedTodoRow[];
};

export const getNoteWithRelations = async (
  id: string,
  userId: string
): Promise<NoteWithRelations | null> => {
  const note = await getNoteByIdScoped(id, userId);
  if (!note) return null;
  const [tags, outgoing, incoming, todos] = await Promise.all([
    listNoteTags(id),
    listOutgoingLinks(id, userId),
    listIncomingLinks(id, userId),
    listLinkedTodos(id, userId),
  ]);
  return { note, tags, outgoing, incoming, todos };
};
