import { turso } from "../config/db.js";
import { newId } from "../utils/id.js";
import { nowISO } from "../utils/time.js";

export type UserDeviceRow = {
  id: string;
  user_id: string;
  fcm_token: string;
  created_at: string;
  updated_at: string;
};

export type TodoReminderRow = {
  id: string;
  user_id: string;
  title: string;
  scheduled_date: string;
  time: string;
};

export type NotificationKind = "morning" | "evening" | "todo_reminder";

const mapDeviceRow = (row: Record<string, unknown>): UserDeviceRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  fcm_token: row.fcm_token as string,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
});

const isUniqueViolation = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE/i.test(message);
};

export const activeUserExists = async (userId: string): Promise<boolean> => {
  const res = await turso.execute({
    sql: "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
    args: [userId],
  });
  return res.rows.length > 0;
};

export const upsertUserDeviceToken = async (
  userId: string,
  token: string
): Promise<UserDeviceRow> => {
  const id = newId();
  const now = nowISO();
  await turso.batch(
    [
      {
        sql: "DELETE FROM user_devices WHERE fcm_token = ? AND user_id <> ?",
        args: [token, userId],
      },
      {
        sql: `INSERT INTO user_devices (id, user_id, fcm_token, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id, fcm_token)
              DO UPDATE SET updated_at = excluded.updated_at`,
        args: [id, userId, token, now, now],
      },
    ],
    "write"
  );

  const res = await turso.execute({
    sql: "SELECT id, user_id, fcm_token, created_at, updated_at FROM user_devices WHERE user_id = ? AND fcm_token = ?",
    args: [userId, token],
  });
  if (res.rows.length === 0) {
    throw new Error("upsertUserDeviceToken: row missing after upsert");
  }
  return mapDeviceRow(res.rows[0] as unknown as Record<string, unknown>);
};

export const listActiveUserIds = async (): Promise<string[]> => {
  const res = await turso.execute({
    sql: "SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC",
    args: [],
  });
  return (res.rows as unknown as { id: string }[]).map((row) => row.id);
};

export const listDeviceTokensByUser = async (
  userId: string
): Promise<string[]> => {
  const res = await turso.execute({
    sql: "SELECT fcm_token FROM user_devices WHERE user_id = ? ORDER BY updated_at DESC",
    args: [userId],
  });
  return (res.rows as unknown as { fcm_token: string }[]).map(
    (row) => row.fcm_token
  );
};

export const deleteDeviceTokens = async (tokens: string[]): Promise<void> => {
  const unique = [...new Set(tokens)].filter((token) => token.length > 0);
  if (unique.length === 0) return;
  await turso.execute({
    sql: `DELETE FROM user_devices WHERE fcm_token IN (${unique.map(() => "?").join(", ")})`,
    args: unique,
  });
};

export const countImportantUrgentTodosForDate = async (
  userId: string,
  date: string
): Promise<number> => {
  const res = await turso.execute({
    sql: `SELECT COUNT(*) AS c
          FROM todos
          WHERE user_id = ?
            AND scheduled_date = ?
            AND parent_id IS NULL
            AND deleted_at IS NULL
            AND status <> 'done'
            AND status <> 'archived'
            AND is_important = 1
            AND is_urgent = 1`,
    args: [userId, date],
  });
  return Number((res.rows[0] as unknown as Record<string, unknown>).c);
};

export const countRemainingTodosForDate = async (
  userId: string,
  date: string
): Promise<number> => {
  const res = await turso.execute({
    sql: `SELECT COUNT(*) AS c
          FROM todos
          WHERE user_id = ?
            AND scheduled_date = ?
            AND parent_id IS NULL
            AND deleted_at IS NULL
            AND status <> 'done'
            AND status <> 'archived'`,
    args: [userId, date],
  });
  return Number((res.rows[0] as unknown as Record<string, unknown>).c);
};

export const listDueTodoReminders = async (
  date: string,
  hhmm: string
): Promise<TodoReminderRow[]> => {
  const res = await turso.execute({
    sql: `SELECT id, user_id, title, scheduled_date, time
          FROM todos
          WHERE scheduled_date = ?
            AND time = ?
            AND parent_id IS NULL
            AND deleted_at IS NULL
            AND status <> 'done'
            AND status <> 'archived'
          ORDER BY user_id ASC, position ASC, created_at ASC`,
    args: [date, hhmm],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    scheduled_date: row.scheduled_date as string,
    time: row.time as string,
  }));
};

export const claimNotificationDelivery = async (input: {
  userId: string;
  todoId?: string | null;
  kind: NotificationKind;
  dedupeKey: string;
  sentAt?: string;
}): Promise<boolean> => {
  const now = input.sentAt ?? nowISO();
  try {
    await turso.execute({
      sql: `INSERT INTO notification_deliveries
            (id, user_id, todo_id, kind, dedupe_key, sent_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        input.userId,
        input.todoId ?? null,
        input.kind,
        input.dedupeKey,
        now,
        now,
      ],
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
};
