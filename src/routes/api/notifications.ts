import type { FastifyInstance, FastifyReply } from "fastify";
import { RegisterNotificationTokenSchema } from "../../schemas/api/notifications.js";
import * as notifications from "../../services/notifications.js";

const mapErr = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof notifications.NotificationServiceError) {
    if (error.code === "not_found") return reply.code(404).send({ error: "not_found" });
    if (error.code === "bad_input") return reply.code(400).send({ error: "bad_input" });
  }
  throw error;
};

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  app.post("/register-token", async (req, reply) => {
    const parsed = RegisterNotificationTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }

    if (parsed.data.userId !== req.userId) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const device = await notifications.registerToken(
        parsed.data.userId,
        parsed.data.token
      );
      return {
        ok: true,
        device_id: device.id,
        updated_at: device.updated_at,
      };
    } catch (error) {
      return mapErr(error, reply);
    }
  });
}
