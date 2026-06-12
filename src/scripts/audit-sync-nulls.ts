/**
 * audit-sync-nulls.ts
 * Run: npx tsx src/scripts/audit-sync-nulls.ts
 *
 * Checks:
 *  1. Which migrations have been applied
 *  2. NULL timestamps in the 4 tables added by migration 0005
 *  3. Sample row from each table
 */
import { turso } from "../config/db.js";

async function main() {
  // ── 1. Migrations ─────────────────────────────────────────────────────────
  console.log("=== MIGRATIONS APPLIED ===");
  const migs = await turso.execute("SELECT name FROM _migrations ORDER BY name");
  for (const r of migs.rows as unknown as { name: string }[]) {
    console.log(" ✓", r.name);
  }

  // ── 2. NULL audit for the 4 tables migration 0005 touched ─────────────────
  console.log("\n=== NULL TIMESTAMP AUDIT (migration 0005 columns) ===");

  const checks: { table: string; cols: string[] }[] = [
    { table: "habit_logs",               cols: ["created_at", "updated_at", "deleted_at"] },
    { table: "checklist_template_items", cols: ["created_at", "updated_at", "deleted_at"] },
    { table: "checklist_runs",           cols: ["created_at", "updated_at", "deleted_at"] },
    { table: "checklist_run_items",      cols: ["created_at", "updated_at", "deleted_at"] },
  ];

  let anyProblem = false;
  for (const { table, cols } of checks) {
    for (const col of cols) {
      try {
        const res = await turso.execute({
          sql: `SELECT COUNT(*) AS c FROM ${table} WHERE ${col} IS NULL`,
          args: [],
        });
        const c = Number((res.rows[0] as unknown as { c: number }).c);
        const flag = c > 0 ? "  ← ⚠️  PROBLEM" : "";
        if (c > 0) anyProblem = true;
        console.log(`  ${table}.${col}: ${c} null rows${flag}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${table}.${col}: ❌ COLUMN MISSING — ${msg}`);
        anyProblem = true;
      }
    }
  }
  if (!anyProblem) console.log("  ✅ No nulls found in timestamp columns.");

  // ── 3. Row counts ──────────────────────────────────────────────────────────
  console.log("\n=== ROW COUNTS ===");
  for (const table of [
    "habit_logs", "checklist_template_items", "checklist_runs", "checklist_run_items",
  ]) {
    const res = await turso.execute({ sql: `SELECT COUNT(*) AS c FROM ${table}`, args: [] });
    const c = (res.rows[0] as unknown as { c: number }).c;
    console.log(`  ${table}: ${c} rows`);
  }

  // ── 4. Sample sync payload per entity type ─────────────────────────────────
  console.log("\n=== SAMPLE ROWS (first row of each table) ===");

  const samples: { label: string; sql: string }[] = [
    {
      label: "habit_log",
      sql: "SELECT id, habit_id, log_date, completed, note, created_at, updated_at, deleted_at FROM habit_logs LIMIT 1",
    },
    {
      label: "checklist_template_item",
      sql: "SELECT id, template_id, position, title, description, is_required, created_at, updated_at, deleted_at FROM checklist_template_items LIMIT 1",
    },
    {
      label: "checklist_run",
      sql: "SELECT id, template_id, user_id, name, status, started_at, completed_at, duration_ms, created_at, updated_at, deleted_at FROM checklist_runs LIMIT 1",
    },
    {
      label: "checklist_run_item",
      sql: "SELECT id, run_id, template_item_id, status, completed_at, note, created_at, updated_at, deleted_at FROM checklist_run_items LIMIT 1",
    },
  ];

  for (const { label, sql } of samples) {
    const res = await turso.execute({ sql, args: [] });
    if (res.rows.length === 0) {
      console.log(`\n  [${label}] — no rows`);
    } else {
      console.log(`\n  [${label}]`);
      const row = res.rows[0] as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(row)) {
        const flag = v === null && !["deleted_at", "completed_at", "duration_ms", "note", "description", "name"].includes(k)
          ? " ← ⚠️  should not be null"
          : "";
        console.log(`    ${k}: ${JSON.stringify(v)}${flag}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
