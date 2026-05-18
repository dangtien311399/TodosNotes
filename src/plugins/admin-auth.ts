import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { role: "admin" };
    user: { role: "admin"; iat: number; exp: number };
  }
}

export default fp(
  async (app) => {
    await app.register(cookie, { secret: env.COOKIE_SECRET });

    await app.register(jwt, {
      secret: env.JWT_ADMIN_SECRET,
      cookie: { cookieName: "admin_token", signed: false },
      sign: { expiresIn: "7d" },
    });

    app.decorate("requireAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await req.jwtVerify<{ role: string }>();
        if (payload.role !== "admin") {
          return reply.redirect("/admin/login");
        }
      } catch {
        return reply.redirect("/admin/login");
      }
    });
  },
  { name: "admin-auth" }
);
