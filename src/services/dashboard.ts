import * as dashRepo from "../repositories/dashboard.js";
import { daysInRange, todayDate } from "../utils/time.js";
import type {
  TodayQueryInput,
  CalendarOverviewQueryInput,
  EisenhowerQueryInput,
} from "../schemas/api/dashboard.js";

// ============================================================
// Score formula (Eisenhower-weighted + frog bonus)
// ============================================================

const W = { Q1: 4, Q2: 3, Q3: 2, Q4: 1, FROG_BONUS: 2, HABIT: 0.5 };

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

const quadrantWeight = (imp: number | null, urg: number | null): number => {
  switch (quadrantOf(imp, urg)) {
    case "q1":
      return W.Q1;
    case "q2":
      return W.Q2;
    case "q3":
      return W.Q3;
    case "q4":
      return W.Q4;
  }
};

const todoWeight = (t: dashRepo.DayTodoStat, date: string): number =>
  quadrantWeight(t.is_important, t.is_urgent) +
  (t.is_frog === 1 && t.frog_date === date ? W.FROG_BONUS : 0);

type HabitScoreInput = { total: number; completed: number };

const computeScore = (
  todos: dashRepo.DayTodoStat[],
  date: string,
  habits: HabitScoreInput = { total: 0, completed: 0 }
): number => {
  let total = 0;
  let done = 0;
  for (const t of todos) {
    const w = todoWeight(t, date);
    total += w;
    if (t.status === "done") done += w;
  }
  total += habits.total * W.HABIT;
  done += habits.completed * W.HABIT;
  return total > 0 ? Math.round((done / total) * 100) : 0;
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

  const score = computeScore(todos, date, habits);

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
  is_important: boolean;
  is_urgent: boolean;
  is_frog: boolean;
  frog_date: string | null;
  quadrant: Quadrant;
};

export type EisenhowerByQuadrant = {
  q1: EisenhowerTodo[];
  q2: EisenhowerTodo[];
  q3: EisenhowerTodo[];
  q4: EisenhowerTodo[];
};

const toEisenhowerTodo = (t: dashRepo.DayTodoStat): EisenhowerTodo => {
  const quadrant = quadrantOf(t.is_important, t.is_urgent);
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    scheduled_date: t.scheduled_date,
    is_important: t.is_important === 1,
    is_urgent: t.is_urgent === 1,
    is_frog: t.is_frog === 1,
    frog_date: t.frog_date,
    quadrant,
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
  for (const t of todos) {
    if (t.status === "done") continue;
    const q = quadrantOf(t.is_important, t.is_urgent);
    by_quadrant[q].push(toEisenhowerTodo(t));
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
      days[d].score = computeScore(todosByDay[d] ?? [], d, {
        total: days[d].habits_total,
        completed: days[d].habits_completed,
      });
    }
  }

  return { from: query.from, to: query.to, days };
};
