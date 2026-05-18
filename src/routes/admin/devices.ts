import type { FastifyInstance } from "fastify";
import * as devices from "../../services/devices.js";
import { getUserById } from "../../services/users.js";
import { consumeFlash, setFlash } from "../../utils/flash.js";

export default async function devicesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAdmin);

  // GET /admin/users/:id/devices
  app.get<{ Params: { id: string } }>("/users/:id/devices", async (req, reply) => {
    const user = await getUserById(req.params.id);
    if (!user) {
      setFlash(reply, "error", "Không tìm thấy user.");
      return reply.redirect("/admin/users");
    }
    const rows = await devices.listDevicesByUser(user.id);
    return reply.view(
      "admin/devices/user.ejs",
      {
        title: `Devices · ${user.email}`,
        active: "users",
        user,
        rows,
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // POST /admin/devices/:id/revoke
  app.post<{ Params: { id: string } }>("/devices/:id/revoke", async (req, reply) => {
    const dev = await devices.getDeviceById(req.params.id);
    if (!dev) {
      setFlash(reply, "error", "Không tìm thấy device.");
      return reply.redirect("/admin/users");
    }
    await devices.revokeDevicePushToken(dev.id);
    setFlash(reply, "success", "Đã thu hồi push_token.");
    return reply.redirect(`/admin/users/${dev.user_id}/devices`);
  });
}
