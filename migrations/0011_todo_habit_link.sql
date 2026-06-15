-- Migration 0011: Link todos to habits
--
-- One habit can be linked by many todos. Each todo can link to at most one habit.
-- Habit logs are written by backend completion events, not by link changes.

ALTER TABLE todos ADD COLUMN habit_id TEXT REFERENCES habits(id) ON DELETE SET NULL;

CREATE INDEX idx_todos_habit_day
  ON todos(user_id, habit_id, scheduled_date)
  WHERE habit_id IS NOT NULL;
