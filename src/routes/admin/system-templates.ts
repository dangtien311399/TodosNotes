import type { FastifyInstance } from "fastify";
import * as templates from "../../services/system-templates.js";
import {
  NewTemplateSchema,
  TemplateMetaSchema,
  ItemAddSchema,
  ItemEditSchema,
  parseItemsText,
} from "../../schemas/admin/system-template.js";
import { consumeFlash, setFlash } from "../../utils/flash.js";

type ListQuery = { filter?: string };

export default async function systemTemplatesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAdmin);

  // GET /admin/system-templates
  app.get<{ Querystring: ListQuery }>("/", async (req, reply) => {
    const filterRaw = req.query.filter ?? "active";
    const filter = (["all", "active", "deleted"] as const).includes(filterRaw as never)
      ? (filterRaw as "all" | "active" | "deleted")
      : "active";
    const rows = await templates.listSystemTemplates(filter);
    return reply.view(
      "admin/system-templates/index.ejs",
      {
        title: "System Templates",
        active: "system-templates",
        rows,
        filter,
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // GET /admin/system-templates/new
  app.get("/new", async (req, reply) => {
    return reply.view(
      "admin/system-templates/new.ejs",
      {
        title: "Tạo template mới",
        active: "system-templates",
        flash: consumeFlash(req, reply),
        formError: null,
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // POST /admin/system-templates
  app.post("/", async (req, reply) => {
    const parsed = NewTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return reply.view(
        "admin/system-templates/new.ejs",
        {
          title: "Tạo template mới",
          active: "system-templates",
          flash: null,
          formError: msg,
        },
        { layout: "layouts/admin.ejs" }
      );
    }
    const items = parseItemsText(parsed.data.items_text);
    const id = await templates.createSystemTemplate({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category ?? null,
      items,
    });
    setFlash(reply, "success", `Đã tạo template với ${items.length} item.`);
    return reply.redirect(`/admin/system-templates/${id}`);
  });

  // GET /admin/system-templates/:id
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const template = await templates.getSystemTemplateById(req.params.id);
    if (!template) {
      setFlash(reply, "error", "Không tìm thấy template.");
      return reply.redirect("/admin/system-templates");
    }
    const items = await templates.listItems(template.id);
    return reply.view(
      "admin/system-templates/detail.ejs",
      {
        title: template.title,
        active: "system-templates",
        template,
        items,
        flash: consumeFlash(req, reply),
      },
      { layout: "layouts/admin.ejs" }
    );
  });

  // POST /admin/system-templates/:id/edit
  app.post<{ Params: { id: string } }>("/:id/edit", async (req, reply) => {
    const parsed = TemplateMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(reply, "error", "Dữ liệu không hợp lệ.");
      return reply.redirect(`/admin/system-templates/${req.params.id}`);
    }
    await templates.updateSystemTemplate(req.params.id, {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category ?? null,
    });
    setFlash(reply, "success", "Đã cập nhật thông tin template.");
    return reply.redirect(`/admin/system-templates/${req.params.id}`);
  });

  // POST /admin/system-templates/:id/delete
  app.post<{ Params: { id: string } }>("/:id/delete", async (req, reply) => {
    await templates.softDeleteSystemTemplate(req.params.id);
    setFlash(reply, "success", "Đã xóa (soft-delete) template.");
    return reply.redirect("/admin/system-templates");
  });

  // POST /admin/system-templates/:id/items
  app.post<{ Params: { id: string } }>("/:id/items", async (req, reply) => {
    const parsed = ItemAddSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(reply, "error", "Tiêu đề item bắt buộc.");
      return reply.redirect(`/admin/system-templates/${req.params.id}`);
    }
    const template = await templates.getSystemTemplateById(req.params.id);
    if (!template) {
      setFlash(reply, "error", "Template không tồn tại.");
      return reply.redirect("/admin/system-templates");
    }
    await templates.addItem(template.id, {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      is_required: parsed.data.is_required,
    });
    setFlash(reply, "success", "Đã thêm item.");
    return reply.redirect(`/admin/system-templates/${template.id}`);
  });

  // POST /admin/system-templates/:id/items/:itemId/edit
  app.post<{ Params: { id: string; itemId: string } }>(
    "/:id/items/:itemId/edit",
    async (req, reply) => {
      const parsed = ItemEditSchema.safeParse(req.body);
      if (!parsed.success) {
        setFlash(reply, "error", "Dữ liệu item không hợp lệ.");
        return reply.redirect(`/admin/system-templates/${req.params.id}`);
      }
      const item = await templates.getItemById(req.params.itemId);
      if (!item || item.template_id !== req.params.id) {
        setFlash(reply, "error", "Item không tồn tại.");
        return reply.redirect(`/admin/system-templates/${req.params.id}`);
      }
      await templates.updateItem(item.id, {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        is_required: parsed.data.is_required,
      });
      setFlash(reply, "success", "Đã cập nhật item.");
      return reply.redirect(`/admin/system-templates/${req.params.id}`);
    }
  );

  // POST /admin/system-templates/:id/items/:itemId/delete
  app.post<{ Params: { id: string; itemId: string } }>(
    "/:id/items/:itemId/delete",
    async (req, reply) => {
      const item = await templates.getItemById(req.params.itemId);
      if (item && item.template_id === req.params.id) {
        await templates.deleteItem(item.id);
        setFlash(reply, "success", "Đã xóa item.");
      }
      return reply.redirect(`/admin/system-templates/${req.params.id}`);
    }
  );
}
