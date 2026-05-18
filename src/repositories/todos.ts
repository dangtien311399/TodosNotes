import { turso } from "../config/db.js";
import { nowISO } from "../utils/time.js";

export type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  is_frog: number;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const mapRow = (row: Record<string, unknown>): TodoRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  title: row.title as string,
  status: row.status as string,
  is_frog: Number(row.is_frog),
  due_at: (row.due_at as string | null) ?? null,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

export const listTodosByUser = async (userId: string, limit = 200): Promise<TodoRow[]> => {
  const res = await turso.execute({
    sql: "SELECT id, user_id, title, status, is_frog, due_at, created_at, updated_at, deleted_at FROM todos WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapRow);
};

export const getTodoById = async (id: string): Promise<TodoRow | null> => {
  const res = await turso.execute({
    sql: "SELECT id, user_id, title, status, is_frog, due_at, created_at, updated_at, deleted_at FROM todos WHERE id = ?",
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const softDeleteTodo = async (id: string): Promise<void> => {
  const now = nowISO();
  await turso.execute({
    sql: "UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    args: [now, now, id],
  });
};
