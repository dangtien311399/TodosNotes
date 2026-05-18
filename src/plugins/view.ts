import fp from "fastify-plugin";
import view from "@fastify/view";
import staticPlugin from "@fastify/static";
import formbody from "@fastify/formbody";
import ejs from "ejs";
import path from "node:path";

const ROOT = process.cwd();
const VIEWS_DIR = path.join(ROOT, "src", "views");
const PUBLIC_DIR = path.join(ROOT, "src", "public");

export default fp(
  async (app) => {
    await app.register(formbody);

    await app.register(view, {
      engine: { ejs },
      root: VIEWS_DIR,
      defaultContext: {
        appName: "Todo Note Admin",
      },
      propertyName: "view",
      includeViewExtension: false,
    });

    await app.register(staticPlugin, {
      root: PUBLIC_DIR,
      prefix: "/public/",
      decorateReply: false,
    });
  },
  { name: "view" }
);
