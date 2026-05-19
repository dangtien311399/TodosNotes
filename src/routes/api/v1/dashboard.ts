import type { FastifyInstance } from "fastify";
import {
  TodayQuerySchema,
  EisenhowerQuerySchema,
  CalendarOverviewQuerySchema,
} from "../../../schemas/api/dashboard.js";
import * as dashboard from "../../../services/dashboard.js";

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  app.get("/today", async (req, reply) => {
    const parsed = TodayQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    return dashboard.getTodayStats(req.userId, parsed.data);
  });

  app.get("/eisenhower", async (req, reply) => {
    const parsed = EisenhowerQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    return dashboard.getEisenhower(req.userId, parsed.data);
  });

  app.get("/calendar", async (req, reply) => {
    const parsed = CalendarOverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    return dashboard.getCalendarOverview(req.userId, parsed.data);
  });
}
