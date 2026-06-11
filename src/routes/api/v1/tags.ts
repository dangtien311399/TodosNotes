import type { FastifyInstance } from "fastify";
import { ListTagSuggestionsQuerySchema } from "../../../schemas/api/tags.js";
import * as tags from "../../../services/tags.js";

export default async function tagsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

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
}
