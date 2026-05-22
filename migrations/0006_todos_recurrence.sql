-- Migration 0006: Recurring todos support
--
-- Model: Template + Instance
--   Template todo: has recurrence_type set, no recurrence_template_id
--   Instance todo: has recurrence_template_id → template; scheduled_date = specific occurrence date
--
-- Who generates instances: the mobile client (offline-first).
-- Server stores whatever the client pushes — no server-side generation logic needed.
--
-- recurrence_type values:
--   'daily'   → every recurrence_interval days (1=daily, 2=every 2 days, 7=weekly same day...)
--   'weekly'  → on specific weekdays (recurrence_days_of_week), every recurrence_interval weeks
--   'custom'  → every recurrence_interval days (alias of daily; naming clarity for UI)

ALTER TABLE todos ADD COLUMN recurrence_type TEXT
  CHECK (recurrence_type IN ('daily', 'weekly', 'custom') OR recurrence_type IS NULL);

ALTER TABLE todos ADD COLUMN recurrence_interval INTEGER DEFAULT 1;
-- 'daily'/'custom' : every N days   (min 1)
-- 'weekly'         : every N weeks  (min 1)

ALTER TABLE todos ADD COLUMN recurrence_days_of_week TEXT;
-- Only relevant when recurrence_type = 'weekly'.
-- Comma-separated ISO weekday numbers: Mon=1 … Sun=7
-- Examples: '1,3,5' = Mon/Wed/Fri   '6,7' = weekends   '1,2,3,4,5' = workdays
-- NULL for 'daily' / 'custom'.

ALTER TABLE todos ADD COLUMN recurrence_end_date TEXT;
-- NULL  = repeat forever
-- ISO date (YYYY-MM-DD) = stop generating instances after this date

ALTER TABLE todos ADD COLUMN recurrence_template_id TEXT
  REFERENCES todos(id) ON DELETE SET NULL;
-- NULL  = this is the template todo (or a plain non-recurring todo)
-- UUID  = this is an instance; points back to the original template todo
-- ON DELETE SET NULL so deleting the template does NOT cascade-delete past instances

CREATE INDEX idx_todos_recur_template
  ON todos(recurrence_template_id)
  WHERE recurrence_template_id IS NOT NULL;

CREATE INDEX idx_todos_recur_active
  ON todos(user_id, recurrence_type)
  WHERE recurrence_type IS NOT NULL;
