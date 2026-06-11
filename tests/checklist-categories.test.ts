import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";

const { turso } = await import("../src/config/db.js");
const checklists = await import("../src/services/checklists.js");

const USER_ID = "user-checklist-categories";

before(async () => {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS checklist_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      icon TEXT,
      color TEXT NOT NULL DEFAULT '#888888',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_test_categories_user_slug_active
    ON checklist_categories(user_id, slug)
    WHERE deleted_at IS NULL
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      category TEXT,
      category_id TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      times_used INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS checklist_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      is_required INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
});

beforeEach(async () => {
  await turso.execute("DELETE FROM checklist_template_items");
  await turso.execute("DELETE FROM checklist_templates");
  await turso.execute("DELETE FROM checklist_categories");
});

test("checklist templates can be categorized by metadata category_id", async () => {
  const { category } = await checklists.createCategory(USER_ID, {
    name: "Code",
    icon: "code",
    color: "#3366ff",
    sort_order: 10,
  });

  const created = await checklists.createTemplate(USER_ID, {
    title: "Release checklist",
    category_id: category.id,
    items: [{ title: "Run build", is_required: true }],
  });

  assert.equal(created.template.category_id, category.id);
  assert.equal(created.template.category, "Code");

  const listed = await checklists.listTemplates(USER_ID, {
    scope: "own",
    category_id: category.id,
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].id, created.template.id);
});

test("deleting a checklist category clears template classification", async () => {
  const { category } = await checklists.createCategory(USER_ID, {
    name: "Health",
    color: "#22aa66",
  });
  const created = await checklists.createTemplate(USER_ID, {
    title: "Morning routine",
    category_id: category.id,
    items: [{ title: "Drink water", is_required: true }],
  });

  await checklists.deleteCategory(USER_ID, category.id);

  const detail = await checklists.getTemplateDetail(USER_ID, created.template.id);
  assert.equal(detail.template.category_id, null);
  assert.equal(detail.template.category, null);
});
