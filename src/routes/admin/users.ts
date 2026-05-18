import type { FastifyInstance } from "fastify";
import * as users from "../../services/users.js";
import { UserEditSchema } from "../../schemas/admin/user-edit.js";
import { consumeFlash, setFlash } from "../../utils/flash.js";

const PAGE_SIZE = 20;

type ListQuery = { q?: string; filter?: string; page?: string };

export default async function usersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAdmin);

  // GET /admin/users
  app.get<{ Querystring: ListQuery }>("/users", async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    const filterRaw = req.query.filter ?? "all";
    const filter = (["all", "active", "disabled"] as const).includes(filterRaw as never)
      ? (filterRaw as "all" | "active" | "disabled")
      : "all";
    const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);

    const { rows, total } = await users.listUsers({ search: q, filter, page, pageSize: PAGE_SIZE });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return reply.view(
      "admin/users/index.ejs",
      {
        title: "Users",
        active: "users",
        rows,
        total,
        page,
        totalPages,
        q,
        filter,
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // GET /admin/users/:id
  app.get<{ Params: { id: string } }>("/users/:id", async (req, reply) => {
    const user = await users.getUserById(req.params.id);
    if (!user) {
      setFlash(reply, "error", "Không tìm thấy user.");
      return reply.redirect("/admin/users");
    }
    return reply.view(
      "admin/users/detail.ejs",
      {
        title: user.email,
        active: "users",
        user,
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // POST /admin/users/:id/disable
  app.post<{ Params: { id: string } }>("/users/:id/disable", async (req, reply) => {
    await users.disableUser(req.params.id);
    setFlash(reply, "success", "Đã vô hiệu hóa user.");
    return reply.redirect(`/admin/users/${req.params.id}`);
  });

  // POST /admin/users/:id/enable
  app.post<{ Params: { id: string } }>("/users/:id/enable", async (req, reply) => {
    await users.enableUser(req.params.id);
    setFlash(reply, "success", "Đã kích hoạt lại user.");
    return reply.redirect(`/admin/users/${req.params.id}`);
  });

  // POST /admin/users/:id/edit
  app.post<{ Params: { id: string } }>("/users/:id/edit", async (req, reply) => {
    const parsed = UserEditSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(reply, "error", "Dữ liệu không hợp lệ.");
      return reply.redirect(`/admin/users/${req.params.id}`);
    }
    await users.updateUserProfile(req.params.id, parsed.data);
    setFlash(reply, "success", "Đã cập nhật thông tin user.");
    return reply.redirect(`/admin/users/${req.params.id}`);
  });

  // POST /admin/users/:id/reset-password
  app.post<{ Params: { id: string } }>("/users/:id/reset-password", async (req, reply) => {
    const plain = await users.resetUserPassword(req.params.id);
    setFlash(
      reply,
      "warning",
      `Mật khẩu tạm: <code>${plain}</code> — Hãy gửi cho user qua kênh an toàn. Mật khẩu này sẽ KHÔNG hiện lại sau khi rời trang.`
    );
    return reply.redirect(`/admin/users/${req.params.id}`);
  });
}
