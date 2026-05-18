import type { FastifyInstance } from "fastify";
import {
  AuthRegisterSchema,
  AuthLoginSchema,
} from "../../../schemas/api/auth.js";
import {
  registerUser,
  loginUser,
  signUserToken,
  publicUser,
  AuthError,
} from "../../../services/api-auth.js";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const parsed = AuthRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const user = await registerUser(
        parsed.data.email,
        parsed.data.password,
        parsed.data.display_name
      );
      const token = signUserToken(app, user.id);
      return reply.code(201).send({ user: publicUser(user), token });
    } catch (e) {
      if (e instanceof AuthError && e.code === "email_taken") {
        return reply.code(409).send({ error: "email_taken" });
      }
      throw e;
    }
  });

  app.post("/login", async (req, reply) => {
    const parsed = AuthLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input" });
    }
    try {
      const user = await loginUser(parsed.data.email, parsed.data.password);
      const token = signUserToken(app, user.id);
      return reply.send({ user: publicUser(user), token });
    } catch (e) {
      if (e instanceof AuthError && e.code === "invalid_credentials") {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      throw e;
    }
  });
}
