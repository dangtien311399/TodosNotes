import type { FastifyInstance } from "fastify";
import { consumeFlash } from "../../utils/flash.js";

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAdmin }, async (req, reply) => {
    return reply.view(
      "admin/dashboard.ejs",
      {
        title: "Dashboard",
        active: "dashboard",
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });
}
