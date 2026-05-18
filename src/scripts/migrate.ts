import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { turso } from "../config/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

/**
 * Tạo bảng tracking nếu chưa tồn tại
 */
async function ensureMigrationsTable(): Promise<void> {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

/**
 * Lấy danh sách các migration đã apply
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await turso.execute("SELECT name FROM _migrations");
  return new Set(result.rows.map((row) => String(row.name)));
}

/**
 * Parse file SQL thành mảng các statement riêng biệt
 * - Bỏ comment dòng (-- ...)
 * - Tách bằng dấu chấm phẩy
 * - Tôn trọng khối BEGIN ... END (cho trigger): không split dấu ';' bên trong khối
 */
function parseStatements(sql: string): string[] {
  const cleaned = sql.replace(/--.*$/gm, "");
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  let i = 0;
  while (i < cleaned.length) {
    const prev = cleaned[i - 1] ?? " ";
    const isBoundary = !/[A-Za-z0-9_]/.test(prev);
    const upper = cleaned.slice(i, i + 6).toUpperCase();
    if (isBoundary && /^BEGIN\b/.test(upper)) {
      depth++;
      buf += cleaned.slice(i, i + 5);
      i += 5;
      continue;
    }
    if (isBoundary && /^END\b/.test(upper)) {
      depth = Math.max(0, depth - 1);
      buf += cleaned.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (cleaned[i] === ";" && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += cleaned[i];
    i++;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/**
 * Chạy 1 migration trong transaction (atomic)
 */
async function runMigration(filename: string, sql: string): Promise<void> {
  const statements = parseStatements(sql);

  if (statements.length === 0) {
    throw new Error(`Không tìm thấy SQL statement nào trong ${filename}`);
  }

  // Tất cả statements + insert tracking record trong 1 transaction.
  // Nếu bất kỳ statement nào lỗi → rollback toàn bộ.
  await turso.batch(
    [
      ...statements,
      {
        sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
        args: [filename, new Date().toISOString()],
      },
    ],
    "write",
  );
}

async function main(): Promise<void> {
  console.log("🔄 Đang chạy migrations...\n");

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("⚠️  Không có file migration nào trong /migrations");
    return;
  }

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭️  Bỏ qua (đã apply): ${file}`);
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    console.log(`▶️  Đang chạy: ${file}`);

    try {
      await runMigration(file, sql);
      console.log(`✅ Hoàn thành:  ${file}\n`);
      appliedCount++;
    } catch (err) {
      console.error(`❌ Lỗi tại ${file}:`);
      console.error(err);
      process.exit(1);
    }
  }

  console.log(`\n✨ Xong. Đã apply ${appliedCount} migration mới.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
