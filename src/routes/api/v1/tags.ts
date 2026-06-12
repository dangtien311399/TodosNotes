import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CreateTagSchema,
  ListTagsQuerySchema,
  ListTagSuggestionsQuerySchema,
  UpdateTagSchema,
} from "../../../schemas/api/tags.js";
import * as tags from "../../../services/tags.js";

const mapErr = (e: unknown, reply: FastifyReply): FastifyReply => {
  if (e instanceof tags.ServiceError) {
    if (e.code === "not_found") return reply.code(404).send({ error: "not_found" });
    if (e.code === "duplicate") return reply.code(409).send({ error: "duplicate" });
  }
  throw e;
};

export default async function tagsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  // GET /?q=&scope=todo|note|all&limit=100
  app.get("/", async (req, reply) => {
    const parsed = ListTagsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    return tags.listTags(req.userId, parsed.data);
  });

  // POST /
  app.post("/", async (req, reply) => {
    const parsed = CreateTagSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    const created = await tags.createTag(req.userId, parsed.data);
    return reply.code(201).send(created);
  });

  // GET /suggestions?scope=todo|note&limit=20
  app.get("/suggestions", async (req, reply) => {
    const parsed = ListTagSuggestionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }

    const items = await tags.listSuggestions(req.userId, parsed.data);
    return { scope: parsed.data.scope, items };
  });

  // PATCH /:id
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const parsed = UpdateTagSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad_input", issues: parsed.error.issues });
    }
    try {
      return await tags.updateTag(req.userId, req.params.id, parsed.data);
    } catch (e) {
      return mapErr(e, reply);
    }
  });

  // DELETE /:id
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    try {
      await tags.deleteTag(req.userId, req.params.id);
      return reply.code(204).send();
    } catch (e) {
      return mapErr(e, reply);
    }
  });
}
