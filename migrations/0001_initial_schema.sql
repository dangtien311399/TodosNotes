-- ============================================================
-- Migration 0001: Initial schema
-- Database: Turso (libSQL / SQLite)
-- Created: 2026-05-17
-- ============================================================

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  settings TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_users_email ON users(email);

-- ============================================================
-- 2. DEVICES
-- ============================================================
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'windows')),
  push_token TEXT,
  last_sync_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_user_platform ON devices(user_id, platform);

-- ============================================================
-- 3. TAGS
-- ============================================================
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_tags_user_name ON tags(user_id, name);

-- ============================================================
-- 4. TODOS (GTD nested, Eisenhower, Frog, Deep Work, Trigger)
-- ============================================================
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'archived')),
  position INTEGER NOT NULL DEFAULT 0,
  is_frog INTEGER NOT NULL DEFAULT 0 CHECK (is_frog IN (0, 1)),
  frog_date TEXT,
  is_important INTEGER CHECK (is_important IS NULL OR is_important IN (0, 1)),
  is_urgent INTEGER CHECK (is_urgent IS NULL OR is_urgent IN (0, 1)),
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  start_at TEXT,
  due_at TEXT,
  trigger_after_todo_id TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_after_todo_id) REFERENCES todos(id) ON DELETE SET NULL
);

CREATE INDEX idx_todos_user_status ON todos(user_id, status);
CREATE INDEX idx_todos_daily_frog ON todos(user_id, frog_date);
CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_todos_due_at ON todos(due_at);
CREATE INDEX idx_todos_trigger ON todos(trigger_after_todo_id);
CREATE INDEX idx_todos_deleted ON todos(deleted_at);

-- ============================================================
-- 5. TODO_TAGS (junction)
-- ============================================================
CREATE TABLE todo_tags (
  todo_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_todo_tags_tag ON todo_tags(tag_id);

-- ============================================================
-- 6. REMINDERS
-- ============================================================
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  message TEXT,
  is_sent INTEGER NOT NULL DEFAULT 0 CHECK (is_sent IN (0, 1)),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_reminders_pending ON reminders(is_sent, remind_at);
CREATE INDEX idx_reminders_todo ON reminders(todo_id);

-- ============================================================
-- 7. NOTES (Free + Cornell)
-- ============================================================
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'free' CHECK (type IN ('free', 'cornell')),
  body TEXT,
  cornell_cue TEXT,
  cornell_summary TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_user_pinned ON notes(user_id, is_pinned);
CREATE INDEX idx_notes_deleted ON notes(deleted_at);

-- ============================================================
-- 8. NOTE_TAGS (junction)
-- ============================================================
CREATE TABLE note_tags (
  note_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);

-- ============================================================
-- 9. NOTE_LINKS (Zettelkasten: note ↔ note)
-- ============================================================
CREATE TABLE note_links (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL,
  target_note_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_note_links_unique ON note_links(source_note_id, target_note_id);
CREATE INDEX idx_note_links_backlinks ON note_links(target_note_id);

-- ============================================================
-- 10. NOTE_TODO_LINKS (Zettelkasten: note ↔ todo)
-- ============================================================
CREATE TABLE note_todo_links (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  todo_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_note_todo_unique ON note_todo_links(note_id, todo_id);
CREATE INDEX idx_note_todo_links_todo ON note_todo_links(todo_id);

-- ============================================================
-- 11. HABITS (Don't Break the Chain)
-- ============================================================
CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#4CAF50',
  frequency_type TEXT NOT NULL DEFAULT 'daily' CHECK (frequency_type IN ('daily', 'weekly', 'custom')),
  target_per_period INTEGER NOT NULL DEFAULT 1,
  active_weekdays TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_habits_user_archived ON habits(user_id, is_archived);

-- ============================================================
-- 12. HABIT_LOGS
-- ============================================================
CREATE TABLE habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_habit_logs_unique ON habit_logs(habit_id, log_date);
CREATE INDEX idx_habit_logs_date ON habit_logs(log_date);

-- ============================================================
-- 13. CHECKLIST_TEMPLATES
-- ============================================================
CREATE TABLE checklist_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_templates_user ON checklist_templates(user_id);
CREATE INDEX idx_checklist_templates_user_cat ON checklist_templates(user_id, category);

-- ============================================================
-- 14. CHECKLIST_TEMPLATE_ITEMS
-- ============================================================
CREATE TABLE checklist_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_items_template_pos ON checklist_template_items(template_id, position);

-- ============================================================
-- 15. CHECKLIST_RUNS
-- ============================================================
CREATE TABLE checklist_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_runs_user_status ON checklist_runs(user_id, status);
CREATE INDEX idx_checklist_runs_template ON checklist_runs(template_id);

-- ============================================================
-- 16. CHECKLIST_RUN_ITEMS
-- ============================================================
CREATE TABLE checklist_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  template_item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  completed_at TEXT,
  note TEXT,
  FOREIGN KEY (run_id) REFERENCES checklist_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (template_item_id) REFERENCES checklist_template_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_run_items_run_status ON checklist_run_items(run_id, status);