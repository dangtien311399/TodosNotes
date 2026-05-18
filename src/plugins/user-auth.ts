import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

type UserPayload = { sub: string; iat?: number; exp?: number };
type RequestWithUserJwt = FastifyRequest & {
  userJwtVerify: <T = UserPayload>() => Promise<T>;
};

export default fp(
  async (app) => {
    await app.register(jwt, {
      secret: env.JWT_SECRET,
      namespace: "user",
      sign: { expiresIn: "30d" },
    });

    app.decorateRequest("userId", "");

    app.decorate("requireUser", async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await (req as RequestWithUserJwt).userJwtVerify<UserPayload>();
        if (!payload?.sub || typeof payload.sub !== "string") {
          return reply.code(401).send({ error: "unauthorized" });
        }
        req.userId = payload.sub;
      } catch {
        return reply.code(401).send({ error: "unauthorized" });
      }
    });
  },
  { name: "user-auth" }
);
