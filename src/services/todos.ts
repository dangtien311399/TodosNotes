import * as todosRepo from "../repositories/todos.js";
import * as tagsRepo from "../repositories/tags.js";
import { addDays } from "../utils/time.js";
import { autoLogHabitForCompletedTodo } from "./todo-habit-logs.js";
import type {
  CreateTodoInput,
  UpdateTodoInput,
  CompleteTodoInput,
  ToggleFrogInput,
  ClassifyEisenhowerInput,
  MoveToDayInput,
  AttachTagInput,
  ReplaceTodoTagsInput,
  ListTodosQueryInput,
} from "../schemas/api/todos.js";

export class ServiceError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid_parent"
      | "invalid_trigger"
      | "invalid_habit"
      | "cycle"
      | "duplicate"
  ) {
    super(code);
  }
}

const wrapRepo = (e: unknown): never => {
  if (e instanceof todosRepo.TodoRepoError) {
    throw new ServiceError(e.code);
  }
  throw e;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const safeInterval = (interval: number | null): number =>
  interval !== null && interval > 0 ? interval : 1;

const isoWeekday = (date: string): number | null => {
  if (!ISO_DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
};

const parseWeekdays = (raw: string | null): number[] => {
  if (!raw) return [];
  return [...new Set(
    raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
  )].sort((a, b) => a - b);
};

const nextRecurrenceDate = (todo: todosRepo.TodoRow): string | null => {
  if (!todo.recurrence_type || !todo.scheduled_date) return null;
  if (!ISO_DATE_RE.test(todo.scheduled_date)) return null;

  const interval = safeInterval(todo.recurrence_interval);
  let nextDate: string;
  if (todo.recurrence_type === "weekly") {
    const weekdays = parseWeekdays(todo.recurrence_days_of_week);
    const currentWeekday = isoWeekday(todo.scheduled_date);
    if (currentWeekday === null) return null;

    if (weekdays.length === 0) {
      nextDate = addDays(todo.scheduled_date, interval * 7);
    } else {
      const laterThisWeek = weekdays.find((day) => day > currentWeekday);
      if (laterThisWeek !== undefined) {
        nextDate = addDays(todo.scheduled_date, laterThisWeek - currentWeekday);
      } else {
        nextDate = addDays(
          todo.scheduled_date,
          7 - currentWeekday + (interval - 1) * 7 + weekdays[0]
        );
      }
    }
  } else {
    nextDate = addDays(todo.scheduled_date, interval);
  }

  if (
    todo.recurrence_end_date &&
    ISO_DATE_RE.test(todo.recurrence_end_date) &&
    nextDate > todo.recurrence_end_date
  ) {
    return null;
  }
  return nextDate;
};

const createNextRecurringTodo = async (
  userId: string,
  source: todosRepo.TodoRow
): Promise<todosRepo.TodoRow | null> => {
  const scheduledDate = nextRecurrenceDate(source);
  if (!scheduledDate) return null;

  const recurrenceTemplateId = source.recurrence_template_id ?? source.id;
  const existing = await todosRepo.findRecurringOccurrenceByDate(
    userId,
    recurrenceTemplateId,
    scheduledDate
  );
  if (existing) return existing;

  return todosRepo.createNextRecurringTodo(
    source,
    scheduledDate,
    recurrenceTemplateId
  );
};

const resolveTagIds = async (
  userId: string,
  input: { tag_ids?: string[]; tags?: string[] }
): Promise<string[]> => {
  const ids = new Set<string>();
  for (const tagId of input.tag_ids ?? []) {
    const tag = await tagsRepo.getTagById(tagId, userId);
    if (!tag) throw new ServiceError("not_found");
    ids.add(tag.id);
  }
  for (const name of input.tags ?? []) {
    const tag = await tagsRepo.findOrCreateByName(userId, name);
    ids.add(tag.id);
  }
  return [...ids];
};

export const createTodo = async (
  userId: string,
  input: CreateTodoInput
): Promise<todosRepo.TodoWithRelations> => {
  let todo: todosRepo.TodoRow;
  try {
    todo = await todosRepo.createTodo({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      parent_id: input.parent_id ?? null,
      scheduled_date: input.scheduled_date ?? null,
      status: input.status,
      is_frog: input.is_frog,
      frog_date: input.frog_date ?? null,
      is_important: input.is_important ?? null,
      is_urgent: input.is_urgent ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      start_at: input.start_at ?? null,
      due_at: input.due_at ?? null,
      trigger_after_todo_id: input.trigger_after_todo_id ?? null,
      habit_id: input.habit_id ?? null,
      position: input.position,
      recurrence_type: input.recurrence_type ?? null,
      recurrence_interval: input.recurrence_interval,
      recurrence_days_of_week: input.recurrence_days_of_week ?? null,
      recurrence_end_date: input.recurrence_end_date ?? null,
      recurrence_template_id: input.recurrence_template_id ?? null,
    });
  } catch (e) {
    return wrapRepo(e);
  }

  const tagIds = await resolveTagIds(userId, {
    tag_ids: input.tag_ids,
    tags: input.tags,
  });
  if (tagIds.length > 0) {
    const ok = await todosRepo.replaceTodoTags(todo.id, tagIds, userId);
    if (!ok) throw new ServiceError("not_found");
  }

  const detail = await todosRepo.getTodoWithRelations(todo.id, userId);
  if (!detail) throw new ServiceError("not_found");
  return detail;
};

export const listTodos = async (
  userId: string,
  query: ListTodosQueryInput
): Promise<todosRepo.ListResult> => {
  const result = await todosRepo.listTodosByUser(userId, {
    cursor: query.cursor,
    limit: query.limit,
    scheduled_date: query.scheduled_date,
    status: query.status,
    is_frog: query.is_frog,
    parent_id: query.parent_id,
    q: query.q,
    tag: query.tag,
    tag_id: query.tag_id,
    habit_id: query.habit_id,
  });
  // Type guard: với opts object trả ListResult; với number trả array. Ở đây luôn object.
  if (Array.isArray(result)) {
    return {
      rows: result.map((row) => ({ ...row, tags: [], tag_ids: [] })),
      nextCursor: null,
    };
  }
  return result;
};

export const getTodoDetail = async (
  userId: string,
  id: string
): Promise<todosRepo.TodoWithRelations> => {
  const detail = await todosRepo.getTodoWithRelations(id, userId);
  if (!detail) throw new ServiceError("not_found");
  return detail;
};

export const updateTodo = async (
  userId: string,
  id: string,
  patch: UpdateTodoInput
): Promise<todosRepo.TodoWithTags> => {
  const { tags, tag_ids, ...todoPatch } = patch;
  const shouldReplaceTags = tags !== undefined || tag_ids !== undefined;
  try {
    const row = await todosRepo.updateTodo(id, userId, todoPatch);
    if (!row) throw new ServiceError("not_found");
    if (shouldReplaceTags) {
      const resolvedTagIds = await resolveTagIds(userId, {
        tag_ids,
        tags,
      });
      const ok = await todosRepo.replaceTodoTags(id, resolvedTagIds, userId);
      if (!ok) throw new ServiceError("not_found");
    }
    const withTags = await todosRepo.getTodoWithTags(id, userId);
    if (!withTags) throw new ServiceError("not_found");
    return withTags;
  } catch (e) {
    return wrapRepo(e);
  }
};

export const deleteTodo = async (userId: string, id: string): Promise<void> => {
  const ok = await todosRepo.softDeleteTodo(id, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const completeTodo = async (
  userId: string,
  id: string,
  body: CompleteTodoInput
): Promise<{
  todo: todosRepo.TodoRow;
  triggered_todos: todosRepo.TodoRow[];
  next_recurring_todo: todosRepo.TodoRow | null;
}> => {
  const result = await todosRepo.completeTodo(id, userId, body.actual_minutes);
  if (!result) throw new ServiceError("not_found");
  const { todo, completedNow } = result;
  const next_recurring_todo =
    completedNow && todo.recurrence_type
      ? await createNextRecurringTodo(userId, todo)
      : null;
  if (completedNow) {
    await autoLogHabitForCompletedTodo(userId, todo);
  }
  const triggered_todos = await todosRepo.listTriggeredTodos(id, userId);
  return { todo, triggered_todos, next_recurring_todo };
};

export const uncompleteTodo = async (
  userId: string,
  id: string
): Promise<todosRepo.TodoRow> => {
  const todo = await todosRepo.uncompleteTodo(id, userId);
  if (!todo) throw new ServiceError("not_found");
  return todo;
};

export const markFrog = async (
  userId: string,
  id: string,
  body: ToggleFrogInput
): Promise<todosRepo.TodoRow> => {
  const todo = await todosRepo.markFrog(id, userId, body.date);
  if (!todo) throw new ServiceError("not_found");
  return todo;
};

export const unmarkFrog = async (
  userId: string,
  id: string
): Promise<todosRepo.TodoRow> => {
  const todo = await todosRepo.unmarkFrog(id, userId);
  if (!todo) throw new ServiceError("not_found");
  return todo;
};

export const classifyEisenhower = async (
  userId: string,
  id: string,
  body: ClassifyEisenhowerInput
): Promise<todosRepo.TodoRow> => {
  const todo = await todosRepo.classifyEisenhower(
    id,
    userId,
    body.is_important,
    body.is_urgent
  );
  if (!todo) throw new ServiceError("not_found");
  return todo;
};

export const moveToDay = async (
  userId: string,
  id: string,
  body: MoveToDayInput
): Promise<todosRepo.TodoRow> => {
  try {
    const row = await todosRepo.updateTodo(id, userId, {
      scheduled_date: body.date,
    });
    if (!row) throw new ServiceError("not_found");
    return row;
  } catch (e) {
    return wrapRepo(e);
  }
};

export const attachTag = async (
  userId: string,
  todoId: string,
  body: AttachTagInput
): Promise<tagsRepo.TagRow> => {
  let tag: tagsRepo.TagRow | null;
  if ("tagId" in body) {
    tag = await tagsRepo.getTagById(body.tagId, userId);
    if (!tag) throw new ServiceError("not_found");
  } else if ("tag_id" in body) {
    tag = await tagsRepo.getTagById(body.tag_id, userId);
    if (!tag) throw new ServiceError("not_found");
  } else {
    tag = await tagsRepo.findOrCreateByName(userId, body.name, body.color);
  }
  try {
    await todosRepo.attachTagToTodo(todoId, tag.id, userId);
  } catch (e) {
    wrapRepo(e);
  }
  return tag;
};

export const detachTag = async (
  userId: string,
  todoId: string,
  tagId: string
): Promise<void> => {
  const ok = await todosRepo.detachTagFromTodo(todoId, tagId, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const replaceTags = async (
  userId: string,
  todoId: string,
  body: ReplaceTodoTagsInput
): Promise<{ tags: tagsRepo.TagRow[]; tag_ids: string[] }> => {
  const tagIds = await resolveTagIds(userId, body);
  const ok = await todosRepo.replaceTodoTags(todoId, tagIds, userId);
  if (!ok) throw new ServiceError("not_found");
  const tags = await todosRepo.listTodoTags(todoId);
  return { tags, tag_ids: tags.map((tag) => tag.id) };
};

export const listDayTopLevel = async (
  userId: string,
  date: string
): Promise<todosRepo.DayTopLevelRow[]> => {
  return todosRepo.listDayTopLevel(userId, date);
};

export const listSubtasks = async (
  userId: string,
  parentId: string
): Promise<todosRepo.TodoRow[]> => {
  // verify parent thuộc user
  const parent = await todosRepo.getTodoByIdScoped(parentId, userId);
  if (!parent) throw new ServiceError("not_found");
  return todosRepo.listSubtasks(parentId, userId);
};
