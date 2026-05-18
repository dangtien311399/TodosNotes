import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { env } from "./config/env.js";
import viewPlugin from "./plugins/view.js";
import adminAuth from "./plugins/admin-auth.js";
import userAuth from "./plugins/user-auth.js";
import adminRoutes from "./routes/admin/index.js";
import apiRoutes from "./routes/api/v1/index.js";

const app: FastifyInstance = Fastify({
  logger: {
    transport:
      env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

// Security
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
});
await app.register(cors, { origin: true });
await app.register(sensible);

// View + static + formbody
await app.register(viewPlugin);

// Admin auth (cookie + jwt default namespace)
await app.register(adminAuth);

// Mobile/user auth (jwt namespace "user", bearer token)
await app.register(userAuth);

// Public health
app.get("/health", async () => ({
  status: "ok",
  time: new Date().toISOString(),
}));

// Admin web
await app.register(adminRoutes, { prefix: "/admin" });

// Mobile REST API
await app.register(apiRoutes, { prefix: "/api/v1" });

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
