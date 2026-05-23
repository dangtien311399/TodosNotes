-- Migration 0007: Patch NULL created_at / updated_at timestamps
--
-- Migration 0005 backfilled these columns using source values that could
-- themselves have been NULL (e.g. checklist_runs.started_at).  Any rows
-- that still carry NULL timestamps break the sync parser on mobile.
--
-- Strategy: multi-level COALESCE → best available column → sentinel date.
-- The sentinel '2026-01-01T00:00:00.000Z' is only reached when ALL
-- candidate source columns are also NULL (edge case for old test data).

-- ── habit_logs ────────────────────────────────────────────────────────────────
-- created_at was in the original schema; updated_at was added in 0005.
-- If the original created_at was somehow NULL, both will be NULL now.
UPDATE habit_logs
SET created_at = COALESCE(created_at, updated_at, log_date || 'T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    updated_at = COALESCE(updated_at, created_at, log_date || 'T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
WHERE created_at IS NULL OR updated_at IS NULL;

-- ── checklist_template_items ──────────────────────────────────────────────────
-- created_at + updated_at existed before 0005; deleted_at was added by 0005.
-- Timestamps should already be non-null; this is a safety net.
UPDATE checklist_template_items
SET created_at = COALESCE(
      created_at,
      (SELECT created_at FROM checklist_templates WHERE id = template_id),
      '2026-01-01T00:00:00.000Z'
    ),
    updated_at = COALESCE(
      updated_at,
      (SELECT updated_at FROM checklist_templates WHERE id = template_id),
      '2026-01-01T00:00:00.000Z'
    )
WHERE created_at IS NULL OR updated_at IS NULL;

-- ── checklist_runs ────────────────────────────────────────────────────────────
-- created_at + updated_at were added by 0005 and backfilled from started_at.
-- If started_at was NULL on an old row, both timestamps remained NULL.
UPDATE checklist_runs
SET created_at = COALESCE(created_at, started_at, '2026-01-01T00:00:00.000Z'),
    updated_at = COALESCE(updated_at, completed_at, started_at, '2026-01-01T00:00:00.000Z')
WHERE created_at IS NULL OR updated_at IS NULL;

-- ── checklist_run_items ───────────────────────────────────────────────────────
-- created_at + updated_at were added by 0005 and backfilled via parent run.
-- Same failure mode: parent run.started_at NULL → both timestamps NULL.
UPDATE checklist_run_items
SET created_at = COALESCE(
      created_at,
      (SELECT started_at FROM checklist_runs WHERE id = run_id),
      '2026-01-01T00:00:00.000Z'
    ),
    updated_at = COALESCE(
      updated_at,
      (SELECT COALESCE(completed_at, started_at)
       FROM checklist_runs WHERE id = run_id),
      '2026-01-01T00:00:00.000Z'
    )
WHERE created_at IS NULL OR updated_at IS NULL;
