import * as todosRepo from "../repositories/todos.js";
import * as tagsRepo from "../repositories/tags.js";
import type {
  CreateTodoInput,
  UpdateTodoInput,
  CompleteTodoInput,
  ToggleFrogInput,
  ClassifyEisenhowerInput,
  MoveToDayInput,
  AttachTagInput,
  ListTodosQueryInput,
} from "../schemas/api/todos.js";

export class ServiceError extends Error {
  constructor(
    public code:
      | "not_found"
      | "daily_limit_reached"
      | "invalid_parent"
      | "invalid_trigger"
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

  if (input.tags && input.tags.length > 0) {
    const resolved = await Promise.all(
      input.tags.map((name) => tagsRepo.findOrCreateByName(userId, name))
    );
    for (const tag of resolved) {
      try {
        await todosRepo.attachTagToTodo(todo.id, tag.id, userId);
      } catch (e) {
        wrapRepo(e);
      }
    }
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
  });
  // Type guard: với opts object trả ListResult; với number trả array. Ở đây luôn object.
  if (Array.isArray(result)) {
    return { rows: result, nextCursor: null };
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
): Promise<todosRepo.TodoRow> => {
  try {
    const row = await todosRepo.updateTodo(id, userId, patch);
    if (!row) throw new ServiceError("not_found");
    return row;
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
): Promise<{ todo: todosRepo.TodoRow; triggered_todos: todosRepo.TodoRow[] }> => {
  const todo = await todosRepo.completeTodo(id, userId, body.actual_minutes);
  if (!todo) throw new ServiceError("not_found");
  const triggered_todos = await todosRepo.listTriggeredTodos(id, userId);
  return { todo, triggered_todos };
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
