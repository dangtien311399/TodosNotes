/**
 * sync.ts — Sync endpoints
 *
 * GET  /api/v1/sync/changes   — pull (§4)
 * POST /api/v1/sync/push      — push (§5)
 *
 * Both require Bearer JWT (app.requireUser sets req.userId).
 */
import type { FastifyInstance } from "fastify";
import { PullQuerySchema, PushBodySchema } from "../../../schemas/api/sync.js";
import { getChangesSince } from "../../../repositories/sync.repo.js";
import { processPush } from "../../../services/sync.service.js";
import { nowISO } from "../../../utils/time.js";

export default async function syncRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  // ── GET /changes ────────────────────────────────────────────────────────────
  /**
   * Pull changes since a timestamp (or full snapshot if omitted).
   *
   * Query params:
   *   since  optional ISO-8601 UTC timestamp
   *          omitted / empty → initial sync (living entities only)
   *          present        → delta (entities with updated_at > since, incl. soft-deleted)
   */
  app.get("/changes", async (req, reply) => {
    const parsed = PullQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }

    const since = parsed.data.since; // undefined = initial
    const changes = await getChangesSince(req.userId, since ?? null);

    return reply.send({
      server_time: nowISO(),
      changes,
    });
  });

  // ── POST /push ──────────────────────────────────────────────────────────────
  /**
   * Push a batch of create / update / delete operations.
   * Max 100 ops per request (§5).
   *
   * Each operation is processed independently — one failure does NOT
   * roll back others. Results array mirrors the operations array 1:1.
   */
  app.post("/push", async (req, reply) => {
    const parsed = PushBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // Distinguish "too many ops" from other validation errors
      const tooMany = parsed.error.issues.some(
        (i) => i.path[0] === "operations" && i.code === "too_big"
      );
      if (tooMany) {
        return reply.code(400).send({ error: "ops_too_many" });
      }
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }

    const results = await processPush(req.userId, parsed.data.operations);

    return reply.send({
      server_time: nowISO(),
      results,
    });
  });
}
