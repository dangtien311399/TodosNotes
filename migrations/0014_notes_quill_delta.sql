ALTER TABLE notes
  ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'
  CHECK (content_format IN ('plain', 'quill_delta_v1'));

ALTER TABLE notes
  ADD COLUMN body_delta TEXT
  CHECK (body_delta IS NULL OR json_valid(body_delta));

ALTER TABLE notes
  ADD COLUMN cornell_cue_delta TEXT
  CHECK (cornell_cue_delta IS NULL OR json_valid(cornell_cue_delta));

ALTER TABLE notes
  ADD COLUMN cornell_summary_delta TEXT
  CHECK (cornell_summary_delta IS NULL OR json_valid(cornell_summary_delta));
