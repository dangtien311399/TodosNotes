-- ============================================================
-- Migration 0004: Thêm scheduled_date cho todos
-- Database: Turso (libSQL / SQLite)
-- Created: 2026-05-18
-- ============================================================
-- Mục đích: Phân biệt "ngày lên kế hoạch làm" (scheduled_date) với
-- "deadline" (due_at). Phục vụ:
--  - Limit 6 task lớn/ngày (top-level + scheduled_date)
--  - Dashboard score theo ngày
--  - Calendar overview
--
-- Frog vẫn dùng (is_frog, frog_date); scheduled_date là nguồn chính
-- để query "todo của ngày X".

ALTER TABLE todos ADD COLUMN scheduled_date TEXT;

CREATE INDEX idx_todos_user_sched ON todos(user_id, scheduled_date);
