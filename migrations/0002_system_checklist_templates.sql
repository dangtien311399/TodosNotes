-- ============================================================
-- Migration 0002: System checklist templates
-- Thêm cờ is_system + tạo SYSTEM user record để giữ FK NOT NULL.
-- ============================================================

ALTER TABLE checklist_templates
  ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1));

CREATE INDEX idx_checklist_templates_system
  ON checklist_templates(is_system) WHERE is_system = 1;

-- SYSTEM user: owner cho mọi system template.
-- ID cố định để hardcode ở const SYSTEM_USER_ID trong code.
-- password_hash = '' (chuỗi rỗng) → tài khoản này không bao giờ login được.
INSERT INTO users (
  id, email, password_hash, display_name, timezone, is_admin, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@todo-note.local',
  '',
  'System',
  'Asia/Ho_Chi_Minh',
  1,
  '2026-05-18T00:00:00.000Z',
  '2026-05-18T00:00:00.000Z'
);
