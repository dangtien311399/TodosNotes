import type { FastifyBaseLogger } from "fastify";
import { addDays } from "../utils/time.js";
import {
  getVietnamNowParts,
  VIETNAM_TIME_ZONE,
} from "../utils/vietnam-time.js";
import { closeAllUsersWithTodosForDate } from "./daily-todo-logs.js";

let interval: NodeJS.Timeout | null = null;
let running = false;

export const runDailyTodoLogTick = async (
  now: Date = new Date()
): Promise<{ closed_date: string | null; users: number }> => {
  const { date, hhmm } = getVietnamNowParts(now);
  if (hhmm !== "00:00") return { closed_date: null, users: 0 };

  const closedDate = addDays(date, -1);
  const result = await closeAllUsersWithTodosForDate(closedDate);
  return { closed_date: closedDate, users: result.users };
};

export const startDailyTodoLogScheduler = (
  logger: FastifyBaseLogger
): void => {
  if (interval) return;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await runDailyTodoLogTick();
      if (result.closed_date) {
        logger.info(result, "Daily todo logs closed");
      }
    } catch (error) {
      logger.error({ err: error }, "Daily todo log scheduler tick failed");
    } finally {
      running = false;
    }
  };

  interval = setInterval(() => {
    void tick();
  }, 60_000);
  interval.unref();
  void tick();

  logger.info({ timezone: VIETNAM_TIME_ZONE }, "Daily todo log scheduler started");
};

export const stopDailyTodoLogSchedulerForTests = (): void => {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  running = false;
};
