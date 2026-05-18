import type { FastifyInstance } from "fastify";
import authRoutes from "./auth.js";
import dashboardRoutes from "./dashboard.js";
import usersRoutes from "./users.js";
import devicesRoutes from "./devices.js";
import contentRoutes from "./content.js";
import systemTemplatesRoutes from "./system-templates.js";

export default async function adminRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(usersRoutes);
  await app.register(devicesRoutes);
  await app.register(contentRoutes);
  await app.register(systemTemplatesRoutes, { prefix: "/system-templates" });
}
