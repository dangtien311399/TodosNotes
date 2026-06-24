import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteLinkSchema,
  NoteTodoLinkSchema,
  AttachTagSchema,
  ListNotesQuerySchema,
} from "../../../schemas/api/notes.js";
import * as notes from "../../../services/notes.js";

const mapErr = (e: unknown, reply: FastifyReply): FastifyReply => {
  if (e instanceof notes.ServiceError) {
    if (e.code === "not_found") return reply.code(404).send({ error: "not_found" });
    if (e.code === "duplicate") return reply.code(409).send({ error: "duplicate" });
    if (e.code === "self_link") return reply.code(400).send({ error: "self_link" });
    if (e.code === "bad_input") return reply.code(400).send({ error: "bad_input" });
  }
  if (e instanceof Error && e.message === "bad_cursor") {
    return reply.code(400).send({ error: "bad_cursor" });
  }
  throw e;
};

export default async function notesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  // POST /
  app.post("/", async (req, reply) => {
    const parsed = CreateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    const result = await notes.createNote(req.userId, parsed.data);
    return reply.code(201).send(result);
  });

  // GET /
  app.get("/", async (req, reply) => {
    const parsed = ListNotesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const { rows, nextCursor } = await notes.listNotes(req.userId, parsed.data);
      return { items: rows, nextCursor };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // GET /:id (with relations)
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    try {
      const detail = await notes.getNoteDetail(req.userId, req.params.id);
      return detail;
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // PATCH /:id
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const parsed = UpdateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const note = await notes.updateNote(req.userId, req.params.id, parsed.data);
      return { note };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // DELETE /:id
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    try {
      await notes.deleteNote(req.userId, req.params.id);
      return reply.code(204).send();
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // POST /:id/links
  app.post<{ Params: { id: string } }>("/:id/links", async (req, reply) => {
    const parsed = NoteLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const link = await notes.addLink(req.userId, req.params.id, parsed.data);
      return reply.code(201).send({ link });
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // DELETE /:id/links/:targetId
  app.delete<{ Params: { id: string; targetId: string } }>(
    "/:id/links/:targetId",
    async (req, reply) => {
      try {
        await notes.removeLink(req.userId, req.params.id, req.params.targetId);
        return reply.code(204).send();
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  // GET /:id/backlinks
  app.get<{ Params: { id: string } }>("/:id/backlinks", async (req, reply) => {
    try {
      const items = await notes.listBacklinks(req.userId, req.params.id);
      return { items };
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // POST /:id/todo-links
  app.post<{ Params: { id: string } }>("/:id/todo-links", async (req, reply) => {
    const parsed = NoteTodoLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const link = await notes.linkTodo(req.userId, req.params.id, parsed.data);
      return reply.code(201).send({ link });
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // DELETE /:id/todo-links/:todoId
  app.delete<{ Params: { id: string; todoId: string } }>(
    "/:id/todo-links/:todoId",
    async (req, reply) => {
      try {
        await notes.unlinkTodo(req.userId, req.params.id, req.params.todoId);
        return reply.code(204).send();
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );

  // POST /:id/tags
  app.post<{ Params: { id: string } }>("/:id/tags", async (req, reply) => {
    const parsed = AttachTagSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      const tag = await notes.attachTag(req.userId, req.params.id, parsed.data);
      return reply.code(201).send({ tag });
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // DELETE /:id/tags/:tagId
  app.delete<{ Params: { id: string; tagId: string } }>(
    "/:id/tags/:tagId",
    async (req, reply) => {
      try {
        await notes.detachTag(req.userId, req.params.id, req.params.tagId);
        return reply.code(204).send();
      } catch (e) {
        return mapErr(e, reply);
      }
    }
  );
}
