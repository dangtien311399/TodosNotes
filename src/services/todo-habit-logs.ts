import * as habitsRepo from "../repositories/habits.js";
import * as todosRepo from "../repositories/todos.js";

const isDoneOnSchedule = (todo: todosRepo.TodoRow): boolean => {
  if (todo.status !== "done" || !todo.completed_at || !todo.scheduled_date) {
    return false;
  }
  return todo.completed_at.slice(0, 10) <= todo.scheduled_date;
};

export const autoLogHabitForCompletedTodo = async (
  userId: string,
  todo: todosRepo.TodoRow
): Promise<habitsRepo.HabitLogRow | null> => {
  if (todo.status !== "done" || !todo.habit_id || !todo.scheduled_date) {
    return null;
  }

  const habit = await habitsRepo.getHabitById(todo.habit_id, userId);
  if (!habit) return null;

  const linkedTodos = await todosRepo.listTodosByHabitDate(
    userId,
    todo.habit_id,
    todo.scheduled_date
  );
  if (linkedTodos.length === 0) return null;

  const completed = linkedTodos.every(isDoneOnSchedule);
  const log = await habitsRepo.upsertAutoLog(
    todo.habit_id,
    todo.scheduled_date,
    completed
  );
  await habitsRepo.recomputeStreaks(todo.habit_id);
  return log;
};
