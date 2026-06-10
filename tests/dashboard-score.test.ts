import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { turso } = await import("../src/config/db.js");
const dashboard = await import("../src/services/dashboard.js");

const USER_ID = "user-dashboard-score";
const NOW = "2026-01-01T00:00:00.000Z";

const insertTodo = async (
  id: string,
  date: string,
  status: "open" | "done",
  isImportant: number,
  isUrgent: number
): Promise<void> => {
  await turso.execute({
    sql: `INSERT INTO todos
          (id, user_id, parent_id, title, status, scheduled_date,
           is_important, is_urgent, is_frog, frog_date, position,
           created_at, updated_at, deleted_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, NULL)`,
    args: [
      id,
      USER_ID,
      id,
      status,
      date,
      isImportant,
      isUrgent,
      NOW,
      NOW,
    ],
  });
};

const insertHabit = async (
  id: string,
  startDate: string,
  endDate: string | null = null
): Promise<void> => {
  await turso.execute({
    sql: `INSERT INTO habits
          (id, user_id, title, start_date, end_date, is_archived, deleted_at)
          VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    args: [id, USER_ID, id, startDate, endDate],
  });
};

const insertHabitLog = async (
  habitId: string,
  date: string,
  completed: number
): Promise<void> => {
  await turso.execute({
    sql: `INSERT INTO habit_logs (id, habit_id, log_date, completed)
          VALUES (?, ?, ?, ?)`,
    args: [`log-${habitId}-${date}`, habitId, date, completed],
  });
};

before(async () => {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      scheduled_date TEXT,
      is_important INTEGER,
      is_urgent INTEGER,
      is_frog INTEGER NOT NULL DEFAULT 0,
      frog_date TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      log_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1
    )
  `);
});

beforeEach(async () => {
  await turso.execute("DELETE FROM habit_logs");
  await turso.execute("DELETE FROM habits");
  await turso.execute("DELETE FROM todos");
});

test("today score includes habits at half a todo point each", async () => {
  const date = "2026-01-10";
  await insertTodo("todo-open-q4", date, "open", 0, 0);
  await insertHabit("habit-done", "2026-01-01");
  await insertHabit("habit-open", "2026-01-01");
  await insertHabitLog("habit-done", date, 1);

  const stats = await dashboard.getTodayStats(USER_ID, { date });

  assert.equal(stats.todos.total, 1);
  assert.deepEqual(stats.habits_today, { total: 2, completed: 1 });
  assert.equal(stats.score, 25);
});

test("calendar score is populated for habit-only past days", async () => {
  const date = "2026-01-11";
  await insertHabit("habit-done", "2026-01-01");
  await insertHabit("habit-open", "2026-01-01");
  await insertHabitLog("habit-done", date, 1);

  const overview = await dashboard.getCalendarOverview(USER_ID, {
    from: date,
    to: date,
  });

  assert.equal(overview.days[date].total_todos, 0);
  assert.equal(overview.days[date].habits_total, 2);
  assert.equal(overview.days[date].habits_completed, 1);
  assert.equal(overview.days[date].score, 50);
});
