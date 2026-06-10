import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { UpdateTodoSchema } = await import("../src/schemas/api/todos.js");
const { turso } = await import("../src/config/db.js");
const todosRepo = await import("../src/repositories/todos.js");
const { processPush } = await import("../src/services/sync.service.js");

const USER_ID = "user-nullable-fields";
const OLD_UPDATED_AT = "2026-01-01T00:00:00.000Z";
const NEW_UPDATED_AT = "2026-01-02T00:00:00.000Z";

const TODO_COLUMNS = [
  "id",
  "user_id",
  "parent_id",
  "title",
  "description",
  "status",
  "position",
  "is_frog",
  "frog_date",
  "is_important",
  "is_urgent",
  "estimated_minutes",
  "actual_minutes",
  "start_at",
  "due_at",
  "scheduled_date",
  "trigger_after_todo_id",
  "completed_at",
  "recurrence_type",
  "recurrence_interval",
  "recurrence_days_of_week",
  "recurrence_end_date",
  "recurrence_template_id",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

type TodoColumn = (typeof TODO_COLUMNS)[number];
type TestTodoRow = Record<TodoColumn, string | number | null>;

const insertTodo = async (
  id: string,
  overrides: Partial<TestTodoRow> = {}
): Promise<void> => {
  const row: TestTodoRow = {
    id,
    user_id: USER_ID,
    parent_id: null,
    title: "Nullable todo",
    description: null,
    status: "open",
    position: 0,
    is_frog: 0,
    frog_date: null,
    is_important: null,
    is_urgent: null,
    estimated_minutes: 30,
    actual_minutes: 15,
    start_at: null,
    due_at: null,
    scheduled_date: "2026-01-02",
    trigger_after_todo_id: null,
    completed_at: null,
    recurrence_type: "weekly",
    recurrence_interval: 7,
    recurrence_days_of_week: "1,3,5",
    recurrence_end_date: "2026-12-31",
    recurrence_template_id: null,
    created_at: OLD_UPDATED_AT,
    updated_at: OLD_UPDATED_AT,
    deleted_at: null,
    ...overrides,
  };

  await turso.execute({
    sql: `INSERT INTO todos (${TODO_COLUMNS.join(", ")})
          VALUES (${TODO_COLUMNS.map(() => "?").join(", ")})`,
    args: TODO_COLUMNS.map((column) => row[column]),
  });
};

const getTodo = async (id: string): Promise<Record<string, unknown>> => {
  const res = await turso.execute({
    sql: "SELECT * FROM todos WHERE id = ?",
    args: [id],
  });
  assert.equal(res.rows.length, 1);
  return res.rows[0] as unknown as Record<string, unknown>;
};

const attachTag = async (todoId: string, tagId: string): Promise<void> => {
  await turso.execute({
    sql: `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, '#888888', ?, ?)`,
    args: [tagId, USER_ID, tagId, OLD_UPDATED_AT, OLD_UPDATED_AT],
  });
  await turso.execute({
    sql: "INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)",
    args: [todoId, tagId],
  });
};

const countTodoTags = async (todoId: string): Promise<number> => {
  const res = await turso.execute({
    sql: "SELECT COUNT(*) AS count FROM todo_tags WHERE todo_id = ?",
    args: [todoId],
  });
  return Number((res.rows[0] as unknown as { count: number }).count);
};

before(async () => {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      position INTEGER NOT NULL DEFAULT 0,
      is_frog INTEGER NOT NULL DEFAULT 0,
      frog_date TEXT,
      is_important INTEGER,
      is_urgent INTEGER,
      estimated_minutes INTEGER,
      actual_minutes INTEGER,
      start_at TEXT,
      due_at TEXT,
      scheduled_date TEXT,
      trigger_after_todo_id TEXT,
      completed_at TEXT,
      recurrence_type TEXT,
      recurrence_interval INTEGER DEFAULT 1,
      recurrence_days_of_week TEXT,
      recurrence_end_date TEXT,
      recurrence_template_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#888888',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (todo_id, tag_id)
    )
  `);
});

beforeEach(async () => {
  await turso.execute("DELETE FROM todo_tags");
  await turso.execute("DELETE FROM tags");
  await turso.execute("DELETE FROM todos");
});

test("PATCH todo can clear estimated_minutes with null", async () => {
  const parsed = UpdateTodoSchema.safeParse({ estimated_minutes: null });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  await insertTodo("todo-patch-estimated", { estimated_minutes: 45 });
  const updated = await todosRepo.updateTodo(
    "todo-patch-estimated",
    USER_ID,
    parsed.data
  );

  assert.equal(updated?.estimated_minutes, null);
  const row = await getTodo("todo-patch-estimated");
  assert.equal(row.estimated_minutes, null);
});

test("PATCH todo can clear recurrence fields with null", async () => {
  const parsed = UpdateTodoSchema.safeParse({
    recurrence_type: null,
    recurrence_interval: null,
    recurrence_days_of_week: null,
    recurrence_end_date: null,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  await insertTodo("todo-patch-recurrence");
  const updated = await todosRepo.updateTodo(
    "todo-patch-recurrence",
    USER_ID,
    parsed.data
  );

  assert.equal(updated?.recurrence_type, null);
  assert.equal(updated?.recurrence_interval, null);
  assert.equal(updated?.recurrence_days_of_week, null);
  assert.equal(updated?.recurrence_end_date, null);
});

test("sync push todo update can clear estimated_minutes with null", async () => {
  await insertTodo("todo-sync-estimated", {
    estimated_minutes: 50,
    recurrence_interval: 7,
  });
  await attachTag("todo-sync-estimated", "tag-existing");

  const results = await processPush(USER_ID, [
    {
      op: "update",
      type: "todo",
      payload: {
        id: "todo-sync-estimated",
        updated_at: NEW_UPDATED_AT,
        estimated_minutes: null,
      },
    },
  ]);

  assert.equal(results[0]?.status, "applied");
  const row = await getTodo("todo-sync-estimated");
  assert.equal(row.estimated_minutes, null);
  assert.equal(Number(row.recurrence_interval), 7);
  assert.equal(await countTodoTags("todo-sync-estimated"), 1);
});

test("sync push todo update can clear recurrence_interval with null", async () => {
  await insertTodo("todo-sync-recurrence", {
    estimated_minutes: 50,
    recurrence_interval: 7,
  });

  const results = await processPush(USER_ID, [
    {
      op: "update",
      type: "todo",
      payload: {
        id: "todo-sync-recurrence",
        updated_at: NEW_UPDATED_AT,
        recurrence_interval: null,
      },
    },
  ]);

  assert.equal(results[0]?.status, "applied");
  const row = await getTodo("todo-sync-recurrence");
  assert.equal(Number(row.estimated_minutes), 50);
  assert.equal(row.recurrence_interval, null);
});
