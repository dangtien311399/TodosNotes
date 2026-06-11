-- ============================================================
-- Migration 0009: User-scoped checklist template ordering
-- Database: Turso (libSQL / SQLite)
-- ============================================================
-- checklist_templates.sort_order is a global/default fallback.
-- checklist_template_orders stores the user's personal order so reordering
-- shared system templates never mutates the global template row.

ALTER TABLE checklist_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_checklist_templates_sort_order
  ON checklist_templates(sort_order, updated_at);

CREATE TABLE checklist_template_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_template_orders_user_order
  ON checklist_template_orders(user_id, sort_order, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_checklist_template_orders_template
  ON checklist_template_orders(template_id);

CREATE INDEX idx_checklist_template_orders_sync
  ON checklist_template_orders(user_id, updated_at);
