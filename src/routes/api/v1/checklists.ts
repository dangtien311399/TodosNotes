import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  UpsertTemplateItemSchema,
  PatchTemplateItemSchema,
  ReorderItemsSchema,
  ListTemplatesQuerySchema,
  StartRunSchema,
  UpdateRunItemSchema,
  ListRunsQuerySchema,
} from "../../../schemas/api/checklists.js";
import * as checklists from "../../../services/checklists.js";

const mapErr = (e: unknown, reply: FastifyReply): FastifyReply => {
  if (e instanceof checklists.ServiceError) {
    if (e.code === "not_found") return reply.code(404).send({ error: "not_found" });
    if (e.code === "incomplete_required")
      return reply.code(409).send({ error: "incomplete_required" });
  }
  if (e instanceof Error && e.message === "bad_cursor") {
    return reply.code(400).send({ error: "bad_cursor" });
  }
  throw e;
};

export default async function checklistsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  // ===== Templates =====

  app.get("/templates", async (req, reply) => {
    const parsed = ListTemplatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    return checklists.listTemplates(req.userId, parsed.data);
  });

  app.get<{ Params: { id: string } }>("/templates/:id", async (req, reply) => {
    try {
      return await checklists.getTemplateDetail(req.userId, req.params.id);
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.post("/templates", async (req, reply) => {
    const parsed = CreateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    const created = await checklists.createTemplate(req.userId, parsed.data);
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>("/templates/:id", async (req, reply) => {
    const parsed = UpdateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const template = await checklists.updateTemplate(
        req.userId,
        req.params.id,
        parsed.data
      );
      return { template };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.delete<{ Params: { id: string } }>("/templates/:id", async (req, reply) => {
    try {
      await checklists.deleteTemplate(req.userId, req.params.id);
      return reply.code(204).send();
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.post<{ Params: { id: string } }>("/templates/:id/items", async (req, reply) => {
    const parsed = UpsertTemplateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const item = await checklists.addTemplateItem(
        req.userId,
        req.params.id,
        parsed.data
      );
      return reply.code(201).send({ item });
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.patch<{ Params: { id: string; itemId: string } }>(
    "/templates/:id/items/:itemId",
    async (req, reply) => {
      const parsed = PatchTemplateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "bad_input", issues: parsed.error.issues });
      }
      try {
        const item = await checklists.patchTemplateItem(
          req.userId,
          req.params.id,
          req.params.itemId,
          parsed.data
        );
        return { item };
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/templates/:id/items/:itemId",
    async (req, reply) => {
      try {
        await checklists.deleteTemplateItem(
          req.userId,
          req.params.id,
          req.params.itemId
        );
        return reply.code(204).send();
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/templates/:id/items/reorder",
    async (req, reply) => {
      const parsed = ReorderItemsSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "bad_input", issues: parsed.error.issues });
      }
      try {
        const items = await checklists.reorderTemplateItems(
          req.userId,
          req.params.id,
          parsed.data
        );
        return { items };
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  // ===== Runs =====

  app.post("/runs", async (req, reply) => {
    const parsed = StartRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const created = await checklists.startRun(req.userId, parsed.data);
      return reply.code(201).send(created);
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.get("/runs", async (req, reply) => {
    const parsed = ListRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const { rows, nextCursor } = await checklists.listRuns(
        req.userId,
        parsed.data
      );
      return { items: rows, nextCursor };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    try {
      return await checklists.getRunDetail(req.userId, req.params.id);
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.patch<{ Params: { id: string; itemId: string } }>(
    "/runs/:id/items/:itemId",
    async (req, reply) => {
      const parsed = UpdateRunItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "bad_input", issues: parsed.error.issues });
      }
      try {
        const item = await checklists.updateRunItem(
          req.userId,
          req.params.id,
          req.params.itemId,
          parsed.data
        );
        return { item };
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  app.post<{ Params: { id: string } }>("/runs/:id/complete", async (req, reply) => {
    try {
      await checklists.completeRun(req.userId, req.params.id);
      return { status: "completed" };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.post<{ Params: { id: string } }>("/runs/:id/abandon", async (req, reply) => {
    try {
      await checklists.abandonRun(req.userId, req.params.id);
      return { status: "abandoned" };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  app.delete<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    try {
      await checklists.deleteRun(req.userId, req.params.id);
      return reply.code(204).send();
    } catch (e) {
      return mapErr(e, reply);
    }
  });
}
