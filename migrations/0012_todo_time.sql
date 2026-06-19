-- ============================================================
-- Migration 0012: Add planned time of day for top-level todos
-- Database: Turso (libSQL / SQLite)
-- ============================================================
-- `time` stores the user's intended reminder time in local wall-clock
-- HH:mm format. Notification scheduling is intentionally handled later.

ALTER TABLE todos ADD COLUMN time TEXT;

CREATE INDEX idx_todos_user_sched_time
  ON todos(user_id, scheduled_date, time)
  WHERE parent_id IS NULL AND deleted_at IS NULL AND time IS NOT NULL;
