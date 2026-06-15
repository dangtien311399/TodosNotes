import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { turso } = await import("../src/config/db.js");
const todosService = await import("../src/services/todos.js");

const USER_ID = "user-recurring-complete";
const OLD = "2026-06-01T00:00:00.000Z";

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
  "habit_id",
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
    title: "Recurring todo",
    description: "Repeat this task",
    status: "open",
    position: 3,
    is_frog: 1,
    frog_date: "2026-06-15",
    is_important: 1,
    is_urgent: 0,
    estimated_minutes: 45,
    actual_minutes: null,
    start_at: "2026-06-15T08:00:00.000Z",
    due_at: "2026-06-15T09:00:00.000Z",
    scheduled_date: "2026-06-15",
    trigger_after_todo_id: null,
    habit_id: null,
    completed_at: null,
    recurrence_type: "daily",
    recurrence_interval: 2,
    recurrence_days_of_week: null,
    recurrence_end_date: "2026-06-30",
    recurrence_template_id: null,
    created_at: OLD,
    updated_at: OLD,
    deleted_at: null,
    ...overrides,
  };

  await turso.execute({
    sql: `INSERT INTO todos (${TODO_COLUMNS.join(", ")})
          VALUES (${TODO_COLUMNS.map(() => "?").join(", ")})`,
    args: TODO_COLUMNS.map((column) => row[column]),
  });
};

const insertTag = async (id: string): Promise<void> => {
  await turso.execute({
    sql: `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, '#3366ff', ?, ?)`,
    args: [id, USER_ID, id, OLD, OLD],
  });
};

const attachTag = async (todoId: string, tagId: string): Promise<void> => {
  await turso.execute({
    sql: "INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)",
    args: [todoId, tagId],
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

const countTodos = async (): Promise<number> => {
  const res = await turso.execute("SELECT COUNT(*) AS count FROM todos");
  return Number((res.rows[0] as unknown as { count: number }).count);
};

const todoTagIds = async (todoId: string): Promise<string[]> => {
  const res = await turso.execute({
    sql: "SELECT tag_id FROM todo_tags WHERE todo_id = ? ORDER BY tag_id ASC",
    args: [todoId],
  });
  return (res.rows as unknown as { tag_id: string }[]).map((row) => row.tag_id);
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
      habit_id TEXT,
      completed_at TEXT,
      recurrence_type TEXT,
      recurrence_interval INTEGER,
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

test("completing a daily recurring todo creates exactly one next occurrence", async () => {
  await insertTodo("todo-daily");
  await insertTag("tag-recurring");
  await attachTag("todo-daily", "tag-recurring");

  const result = await todosService.completeTodo(USER_ID, "todo-daily", {
    actual_minutes: 30,
  });

  assert.equal(result.todo.status, "done");
  assert.equal(result.todo.actual_minutes, 30);
  assert.ok(result.todo.completed_at);
  assert.ok(result.next_recurring_todo);

  const next = result.next_recurring_todo;
  assert.equal(next.title, "Recurring todo");
  assert.equal(next.description, "Repeat this task");
  assert.equal(next.status, "open");
  assert.equal(next.completed_at, null);
  assert.equal(next.actual_minutes, null);
  assert.equal(next.scheduled_date, "2026-06-17");
  assert.equal(next.due_at, "2026-06-15T09:00:00.000Z");
  assert.equal(next.habit_id, null);
  assert.equal(next.recurrence_type, "daily");
  assert.equal(next.recurrence_interval, 2);
  assert.equal(next.recurrence_template_id, "todo-daily");
  assert.deepEqual(await todoTagIds(next.id), ["tag-recurring"]);
  assert.equal(await countTodos(), 2);

  const retry = await todosService.completeTodo(USER_ID, "todo-daily", {});
  assert.equal(retry.next_recurring_todo, null);
  assert.equal(await countTodos(), 2);
});

test("weekly recurrence uses the next configured weekday", async () => {
  await insertTodo("todo-weekly", {
    recurrence_type: "weekly",
    recurrence_interval: 1,
    recurrence_days_of_week: "1,3,5",
    recurrence_end_date: "2026-07-31",
  });

  const result = await todosService.completeTodo(USER_ID, "todo-weekly", {});

  assert.equal(result.next_recurring_todo?.scheduled_date, "2026-06-17");
  assert.equal(result.next_recurring_todo?.recurrence_type, "weekly");
  assert.equal(result.next_recurring_todo?.recurrence_days_of_week, "1,3,5");
});

test("recurrence_end_date prevents creating an occurrence beyond the end date", async () => {
  await insertTodo("todo-ended", {
    recurrence_end_date: "2026-06-16",
  });

  const result = await todosService.completeTodo(USER_ID, "todo-ended", {});

  assert.equal(result.next_recurring_todo, null);
  assert.equal(await countTodos(), 1);
});

test("existing next occurrence is reused instead of duplicated", async () => {
  await insertTodo("todo-template");
  await insertTodo("todo-existing-next", {
    scheduled_date: "2026-06-17",
    recurrence_template_id: "todo-template",
  });

  const result = await todosService.completeTodo(USER_ID, "todo-template", {});

  assert.equal(result.next_recurring_todo?.id, "todo-existing-next");
  assert.equal(await countTodos(), 2);

  const original = await getTodo("todo-template");
  assert.equal(original.status, "done");
});
