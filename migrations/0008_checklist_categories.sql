-- ============================================================
-- Migration 0008: Checklist categories with metadata
-- Database: Turso (libSQL / SQLite)
-- ============================================================
-- Adds a first-class category entity for checklist templates while keeping
-- checklist_templates.category as a legacy/display fallback for old clients.

CREATE TABLE checklist_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#888888',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_checklist_categories_user_slug_active
  ON checklist_categories(user_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_checklist_categories_user_order
  ON checklist_categories(user_id, is_system, sort_order, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_checklist_categories_sync
  ON checklist_categories(user_id, updated_at);

ALTER TABLE checklist_templates ADD COLUMN category_id TEXT;

CREATE INDEX idx_checklist_templates_category_id
  ON checklist_templates(category_id);

-- Backfill existing string categories into first-class rows. SQLite/libSQL has
-- no UUID function, so generate v4-shaped ids from randomblob().
INSERT INTO checklist_categories (
  id, user_id, name, slug, icon, color, sort_order, is_system, created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))) AS id,
  user_id,
  trimmed_category AS name,
  lower(replace(trimmed_category, ' ', '-')) AS slug,
  NULL AS icon,
  '#888888' AS color,
  0 AS sort_order,
  MAX(is_system) AS is_system,
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM (
  SELECT
    user_id,
    TRIM(category) AS trimmed_category,
    is_system,
    created_at,
    updated_at
  FROM checklist_templates
  WHERE category IS NOT NULL AND TRIM(category) <> ''
)
GROUP BY user_id, lower(replace(trimmed_category, ' ', '-'));

UPDATE checklist_templates
SET category_id = (
  SELECT c.id
  FROM checklist_categories c
  WHERE c.user_id = checklist_templates.user_id
    AND c.slug = lower(replace(TRIM(checklist_templates.category), ' ', '-'))
    AND c.deleted_at IS NULL
  LIMIT 1
)
WHERE category_id IS NULL
  AND category IS NOT NULL
  AND TRIM(category) <> '';
