import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import "dotenv/config";

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

// Plugins
await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(sensible);

// Health check (Render dùng để verify deploy)
app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

// Khởi động — QUAN TRỌNG cho Render
const PORT = process.env.PORT || 3000;
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}