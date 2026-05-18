-- ============================================================
-- Migration 0003: Full-text search cho notes (FTS5)
-- Database: Turso (libSQL / SQLite)
-- Created: 2026-05-18
-- ============================================================
-- Mục đích: cho phép search trong title + body + cornell_cue + cornell_summary
-- Strategy: contentless-style FTS5 mirror, sync qua triggers AFTER INSERT/UPDATE/DELETE.
-- Soft-deleted notes vẫn nằm trong FTS (vì UPDATE chỉ set deleted_at) → query app-layer
-- phải JOIN notes và filter `notes.deleted_at IS NULL`.

CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body,
  cornell_cue,
  cornell_summary,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(note_id, title, body, cornell_cue, cornell_summary)
  VALUES (
    new.id,
    new.title,
    coalesce(new.body, ''),
    coalesce(new.cornell_cue, ''),
    coalesce(new.cornell_summary, '')
  );
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
  INSERT INTO notes_fts(note_id, title, body, cornell_cue, cornell_summary)
  VALUES (
    new.id,
    new.title,
    coalesce(new.body, ''),
    coalesce(new.cornell_cue, ''),
    coalesce(new.cornell_summary, '')
  );
END;

-- Backfill cho notes đã tồn tại (chỉ note đang "sống")
INSERT INTO notes_fts(note_id, title, body, cornell_cue, cornell_summary)
SELECT
  id,
  title,
  coalesce(body, ''),
  coalesce(cornell_cue, ''),
  coalesce(cornell_summary, '')
FROM notes
WHERE deleted_at IS NULL;
