-- 0005_sync_readiness.sql
-- Thêm cột timestamp / soft-delete còn thiếu cho 4 bảng + delta indexes
-- Đảm bảo mọi thao tác soft-delete luôn bump updated_at = deleted_at = nowISO()

-- =================================================================
-- 1. habit_logs: ADD updated_at, deleted_at; backfill; hard→soft delete
-- =================================================================
ALTER TABLE habit_logs ADD COLUMN updated_at TEXT;
ALTER TABLE habit_logs ADD COLUMN deleted_at TEXT;

-- Backfill: updated_at = created_at cho mọi row hiện có
UPDATE habit_logs SET updated_at = created_at WHERE updated_at IS NULL;

-- =================================================================
-- 2. checklist_template_items: ADD deleted_at
-- =================================================================
ALTER TABLE checklist_template_items ADD COLUMN deleted_at TEXT;

-- =================================================================
-- 3. checklist_runs: ADD created_at, updated_at, deleted_at; backfill
-- =================================================================
ALTER TABLE checklist_runs ADD COLUMN created_at TEXT;
ALTER TABLE checklist_runs ADD COLUMN updated_at TEXT;
ALTER TABLE checklist_runs ADD COLUMN deleted_at TEXT;

-- Backfill: created_at = started_at; updated_at = COALESCE(completed_at, started_at)
UPDATE checklist_runs SET created_at = started_at WHERE created_at IS NULL;
UPDATE checklist_runs SET updated_at = COALESCE(completed_at, started_at) WHERE updated_at IS NULL;

-- =================================================================
-- 4. checklist_run_items: ADD created_at, updated_at, deleted_at; backfill
-- =================================================================
ALTER TABLE checklist_run_items ADD COLUMN created_at TEXT;
ALTER TABLE checklist_run_items ADD COLUMN updated_at TEXT;
ALTER TABLE checklist_run_items ADD COLUMN deleted_at TEXT;

-- Backfill qua run.started_at; fallback IS NULL sẽ được set từ run
UPDATE checklist_run_items SET created_at = (
  SELECT started_at FROM checklist_runs WHERE checklist_runs.id = checklist_run_items.run_id
) WHERE created_at IS NULL;

UPDATE checklist_run_items SET updated_at = (
  SELECT COALESCE(completed_at, started_at) FROM checklist_runs WHERE checklist_runs.id = checklist_run_items.run_id
) WHERE updated_at IS NULL;

-- =================================================================
-- 5. Delta indexes trên updated_at (user-scoped tables)
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_todos_sync ON todos(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_sync ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tags_sync ON tags(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_habits_sync ON habits(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_sync ON checklist_templates(user_id, updated_at);

-- Delta indexes cho bảng con (không có user_id trực tiếp — sync qua parent)
CREATE INDEX IF NOT EXISTS idx_habit_logs_sync ON habit_logs(updated_at);
CREATE INDEX IF NOT EXISTS idx_checklist_template_items_sync ON checklist_template_items(template_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_sync ON checklist_runs(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_checklist_run_items_sync ON checklist_run_items(updated_at);
