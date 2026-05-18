import type { FastifyInstance } from "fastify";
import authRoutes from "./auth.js";
import notesRoutes from "./notes.js";

export default async function apiRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(notesRoutes, { prefix: "/notes" });
}
