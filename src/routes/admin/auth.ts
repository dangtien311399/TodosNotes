import type { FastifyInstance } from "fastify";
import { LoginSchema } from "../../schemas/admin/login.js";
import { verifyAdminCredentials } from "../../services/admin-auth.js";
import { env } from "../../config/env.js";

export default async function authRoutes(app: FastifyInstance) {
  // GET /admin/login — show form (if already logged in → /admin)
  app.get("/login", async (req, reply) => {
    try {
      const payload = await req.jwtVerify<{ role: string }>();
      if (payload.role === "admin") {
        return reply.redirect("/admin");
      }
    } catch {
      /* not logged in, fall through */
    }
    return reply.view("admin/login.ejs");
  });

  // POST /admin/login
  app.post("/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.view("admin/login.ejs", { error: "Vui lòng nhập đủ tài khoản và mật khẩu." });
    }

    const ok = await verifyAdminCredentials(parsed.data.username, parsed.data.password);
    if (!ok) {
      return reply.view("admin/login.ejs", { error: "Sai tài khoản hoặc mật khẩu." });
    }

    const token = app.jwt.sign({ role: "admin" });
    reply.setCookie("admin_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return reply.redirect("/admin");
  });

  // POST /admin/logout
  app.post("/logout", { preHandler: app.requireAdmin }, async (_req, reply) => {
    reply.clearCookie("admin_token", { path: "/" });
    return reply.redirect("/admin/login");
  });
}
