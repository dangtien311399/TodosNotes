import * as dashRepo from "../repositories/dashboard.js";
import { listTagsForTodoIds } from "../repositories/todos.js";
import { daysInRange, todayDate } from "../utils/time.js";
import type { TagRow } from "../repositories/tags.js";
import type {
  TodayQueryInput,
  CalendarOverviewQueryInput,
  EisenhowerQueryInput,
} from "../schemas/api/dashboard.js";

// ============================================================
// Score formula (flat todo base + mark bonuses)
// ============================================================

const SCORE_BASE = 100;
const TODO_BONUS = { FROG: 10, IMPORTANT: 5 };

type Quadrant = "q1" | "q2" | "q3" | "q4";

const quadrantOf = (
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

const isFrogForDate = (t: dashRepo.DayTodoStat, date: string): boolean =>
  t.is_frog === 1 && t.frog_date === date;

const isScoredTodo = (t: dashRepo.DayTodoStat, date: string): boolean =>
  t.is_important === 1 || t.is_urgent === 1 || isFrogForDate(t, date);

const completedTodoScore = (
  t: dashRepo.DayTodoStat,
  date: string,
  baseScore: number
): number => {
  if (t.status !== "done") return 0;
  return (
    baseScore +
    (isFrogForDate(t, date) ? TODO_BONUS.FROG : 0) +
    (t.is_important === 1 ? TODO_BONUS.IMPORTANT : 0)
  );
};

const computeScore = (
  todos: dashRepo.DayTodoStat[],
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

// ============================================================
// GET /today
// ============================================================

export type TodayStats = {
  date: string;
  score: number;
  todos: { total: number; done: number };
  eisenhower_counts: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
  };
  habits_today: { total: number; completed: number };
  frog: { id: string; title: string; status: string } | null;
};

export const getTodayStats = async (
  userId: string,
  query: TodayQueryInput
): Promise<TodayStats> => {
  const date = query.date ?? todayDate();
  const [todos, habits, frog] = await Promise.all([
    dashRepo.listDayTopLevelStats(userId, date),
    dashRepo.countDayHabits(userId, date),
    dashRepo.getFrogForDay(userId, date),
  ]);

  const score = computeScore(todos, date);

  const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of todos) {
    if (t.status === "done") continue;
    counts[quadrantOf(t.is_important, t.is_urgent)]++;
  }

  return {
    date,
    score,
    todos: {
      total: todos.length,
      done: todos.filter((t) => t.status === "done").length,
    },
    eisenhower_counts: counts,
    habits_today: habits,
    frog,
  };
};

// ============================================================
// GET /eisenhower
// ============================================================

export type EisenhowerTodo = {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  time: string | null;
  is_important: boolean;
  is_urgent: boolean;
  is_frog: boolean;
  frog_date: string | null;
  quadrant: Quadrant;
  tags: TagRow[];
  tag_ids: string[];
};

export type EisenhowerByQuadrant = {
  q1: EisenhowerTodo[];
  q2: EisenhowerTodo[];
  q3: EisenhowerTodo[];
  q4: EisenhowerTodo[];
};

const toEisenhowerTodo = (
  t: dashRepo.DayTodoStat,
  tags: TagRow[] = []
): EisenhowerTodo => {
  const quadrant = quadrantOf(t.is_important, t.is_urgent);
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    scheduled_date: t.scheduled_date,
    time: t.time,
    is_important: t.is_important === 1,
    is_urgent: t.is_urgent === 1,
    is_frog: t.is_frog === 1,
    frog_date: t.frog_date,
    quadrant,
    tags,
    tag_ids: tags.map((tag) => tag.id),
  };
};

export const getEisenhower = async (
  userId: string,
  query: EisenhowerQueryInput
): Promise<{
  date: string;
  counts: TodayStats["eisenhower_counts"];
  by_quadrant: EisenhowerByQuadrant;
}> => {
  const date = query.date ?? todayDate();
  const todos = await dashRepo.listDayTopLevelStats(userId, date);
  const by_quadrant: EisenhowerByQuadrant = {
    q1: [],
    q2: [],
    q3: [],
    q4: [],
  };
  const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const tagMap = await listTagsForTodoIds(todos.map((todo) => todo.id));
  for (const t of todos) {
    if (t.status === "done") continue;
    const q = quadrantOf(t.is_important, t.is_urgent);
    by_quadrant[q].push(toEisenhowerTodo(t, tagMap.get(t.id) ?? []));
    counts[q]++;
  }
  return { date, counts, by_quadrant };
};

// ============================================================
// GET /calendar
// ============================================================

export type CalendarDay = {
  total_todos: number;
  done_todos: number;
  score?: number; // chỉ có khi date <= today
  habits_total: number;
  habits_completed: number;
};

export type CalendarOverview = {
  from: string;
  to: string;
  days: Record<string, CalendarDay>;
};

export const getCalendarOverview = async (
  userId: string,
  query: CalendarOverviewQueryInput
): Promise<CalendarOverview> => {
  const today = todayDate();
  const days: Record<string, CalendarDay> = {};
  for (const d of daysInRange(query.from, query.to)) {
    days[d] = {
      total_todos: 0,
      done_todos: 0,
      habits_total: 0,
      habits_completed: 0,
    };
  }

  const [todos, habits, logs] = await Promise.all([
    dashRepo.rawTodosInRange(userId, query.from, query.to),
    dashRepo.activeHabitsInRange(userId, query.from, query.to),
    dashRepo.allLogsInRange(userId, query.from, query.to),
  ]);

  // Todos
  const todosByDay: Record<string, dashRepo.DayTodoStat[]> = {};
  for (const t of todos) {
    if (!t.scheduled_date || !days[t.scheduled_date]) continue;
    (todosByDay[t.scheduled_date] ??= []).push(t);
    days[t.scheduled_date].total_todos++;
    if (t.status === "done") days[t.scheduled_date].done_todos++;
  }
  // Habits active per day
  for (const d of Object.keys(days)) {
    days[d].habits_total = habits.filter(
      (h) => h.start_date <= d && (h.end_date === null || h.end_date >= d)
    ).length;
  }

  // Habits completed per day
  const completedByDay: Record<string, Set<string>> = {};
  for (const l of logs) {
    if (l.completed === 1) {
      (completedByDay[l.log_date] ??= new Set()).add(l.habit_id);
    }
  }
  for (const [d, s] of Object.entries(completedByDay)) {
    if (days[d]) days[d].habits_completed = s.size;
  }

  for (const d of Object.keys(days)) {
    if (d <= today) {
      days[d].score = computeScore(todosByDay[d] ?? [], d);
    }
  }

  return { from: query.from, to: query.to, days };
};
