import type { FastifyInstance } from "fastify";
import authRoutes from "./auth.js";
import notesRoutes from "./notes.js";
import todosRoutes from "./todos.js";
import habitsRoutes from "./habits.js";
import checklistsRoutes from "./checklists.js";
import dashboardRoutes from "./dashboard.js";

export default async function apiRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(notesRoutes, { prefix: "/notes" });
  await app.register(todosRoutes, { prefix: "/todos" });
  await app.register(habitsRoutes, { prefix: "/habits" });
  await app.register(checklistsRoutes, { prefix: "/checklists" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
}
