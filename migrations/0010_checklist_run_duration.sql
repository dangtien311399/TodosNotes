-- ============================================================
-- Migration 0010: Checklist run duration
-- Database: Turso (libSQL / SQLite)
-- ============================================================
-- Duration is supplied by the mobile stopwatch when a run is completed.
-- NULL means the client did not provide a duration for this run.

ALTER TABLE checklist_runs ADD COLUMN duration_ms INTEGER;
