import { vietnamDateFromISO } from "../utils/vietnam-time.js";

export const SCORE_BASE = 100;
export const TODO_BONUS = { FROG: 10, IMPORTANT: 5 } as const;

export type Quadrant = "q1" | "q2" | "q3" | "q4";

export type ScorableTodo = {
  status: string;
  completed_at: string | null;
  is_important: number | null;
  is_urgent: number | null;
  is_frog: number;
  frog_date: string | null;
};

export const quadrantOf = (
  imp: number | null,
  urg: number | null
): Quadrant => {
  // Dashboard/mobile contract is a strict 4-cell Eisenhower matrix.
  // Old/unclassified rows are treated as Q4 instead of producing a fifth bucket.
  if (imp === null || urg === null) return "q4";
  if (imp === 1 && urg === 1) return "q1";
  if (imp === 1 && urg === 0) return "q2";
  if (imp === 0 && urg === 1) return "q3";
  return "q4";
};

export const isFrogForDate = (t: ScorableTodo, date: string): boolean =>
  t.is_frog === 1 && t.frog_date === date;

export const isScoredTodo = (t: ScorableTodo, date: string): boolean =>
  t.is_important === 1 || t.is_urgent === 1 || isFrogForDate(t, date);

export const isCompletedForScore = (
  t: ScorableTodo,
  date: string
): boolean => {
  if (t.status !== "done") return false;
  if (!t.completed_at) return true;
  const completedDate = vietnamDateFromISO(t.completed_at);
  return completedDate !== null && completedDate <= date;
};

const completedTodoScore = (
  t: ScorableTodo,
  date: string,
  baseScore: number
): number => {
  if (!isCompletedForScore(t, date)) return 0;
  return (
    baseScore +
    (isFrogForDate(t, date) ? TODO_BONUS.FROG : 0) +
    (t.is_important === 1 ? TODO_BONUS.IMPORTANT : 0)
  );
};

export const computeScore = (
  todos: ScorableTodo[],
  date: string
): number => {
  const scoredTodos = todos.filter((t) => isScoredTodo(t, date));
  if (scoredTodos.length === 0) return 0;

  const baseScore = SCORE_BASE / scoredTodos.length;
  const score = scoredTodos.reduce(
    (sum, t) => sum + completedTodoScore(t, date, baseScore),
    0
  );
  return Math.round(score);
};
