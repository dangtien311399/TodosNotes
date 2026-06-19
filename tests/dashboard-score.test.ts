import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { turso } = await import("../src/config/db.js");
const dashboard = await import("../src/services/dashboard.js");

const USER_ID = "user-dashboard-score";
const NOW = "2026-01-01T00:00:00.000Z";

type TodoInsertOptions = {
  isFrog?: number;
  frogDate?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
};

const insertTodo = async (
  id: string,
  date: string,
  status: "open" | "done",
  isImportant: number | null,
  isUrgent: number,
  options: TodoInsertOptions = {}
): Promise<void> => {
  const completedAt =
    options.completedAt !== undefined
      ? options.completedAt
      : status === "done"
        ? NOW
        : null;
  await turso.execute({
    sql: `INSERT INTO todos
          (id, user_id, parent_id, title, status, scheduled_date,
           is_important, is_urgent, is_frog, frog_date, position,
           due_at, completed_at,
           created_at, updated_at, deleted_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
    args: [
      id,
      USER_ID,
      id,
      status,
      date,
      isImportant,
      isUrgent,
      options.isFrog ?? 0,
      options.frogDate ?? null,
      options.dueAt ?? null,
      completedAt,
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
      time TEXT,
      is_important INTEGER,
      is_urgent INTEGER,
      is_frog INTEGER NOT NULL DEFAULT 0,
      frog_date TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      due_at TEXT,
      completed_at TEXT,
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

test("todo score uses flat base and can exceed 100 with bonuses", async () => {
  const date = "2026-01-10";
  await insertTodo("todo-frog-important", date, "done", 1, 0, {
    isFrog: 1,
    frogDate: date,
  });
  await insertTodo("todo-urgent-a", date, "open", 0, 1);
  await insertTodo("todo-urgent-b", date, "open", 0, 1);
  await insertTodo("todo-urgent-c", date, "open", 0, 1);

  let stats = await dashboard.getTodayStats(USER_ID, { date });

  assert.equal(stats.todos.total, 4);
  assert.equal(stats.todos.done, 1);
  assert.equal(stats.score, 40);

  await turso.execute({
    sql: `UPDATE todos
          SET status = 'done', completed_at = ?
          WHERE id IN (?, ?, ?)`,
    args: [NOW, "todo-urgent-a", "todo-urgent-b", "todo-urgent-c"],
  });

  stats = await dashboard.getTodayStats(USER_ID, { date });

  assert.equal(stats.todos.done, 4);
  assert.equal(stats.score, 115);
});

test("urgent-only todos have no bonus and unmarked todos are ignored", async () => {
  const date = "2026-01-10";
  await insertTodo("todo-important", date, "done", 1, 0);
  await insertTodo("todo-urgent", date, "done", 0, 1);
  await insertTodo("todo-unmarked", date, "done", 0, 0);

  const stats = await dashboard.getTodayStats(USER_ID, { date });

  assert.equal(stats.todos.total, 3);
  assert.equal(stats.todos.done, 3);
  assert.equal(stats.score, 105);
});

test("habits are reported but do not add todo score", async () => {
  const date = "2026-01-10";
  await insertHabit("habit-done", "2026-01-01");
  await insertHabit("habit-open", "2026-01-01");
  await insertHabitLog("habit-done", date, 1);

  const stats = await dashboard.getTodayStats(USER_ID, { date });

  assert.equal(stats.todos.total, 0);
  assert.deepEqual(stats.habits_today, { total: 2, completed: 1 });
  assert.equal(stats.score, 0);
});

test("calendar score uses the same todo bonus model", async () => {
  const date = "2026-01-11";
  await insertTodo("todo-frog", date, "done", 0, 0, {
    isFrog: 1,
    frogDate: date,
  });
  await insertTodo("todo-urgent", date, "open", 0, 1);

  const overview = await dashboard.getCalendarOverview(USER_ID, {
    from: date,
    to: date,
  });

  assert.equal(overview.days[date].total_todos, 2);
  assert.equal(overview.days[date].done_todos, 1);
  assert.equal(overview.days[date].score, 60);
});
