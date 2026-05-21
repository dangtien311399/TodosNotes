import "../config/env.js"; // validate env trước khi connect Turso
import { turso } from "../config/db.js";
import { SYSTEM_USER_ID } from "../utils/id.js";

type Args = {
  emails: string[] | null;
  confirm: boolean;
  includeDeleted: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let emails: string[] | null = null;
  let confirm = false;
  let includeDeleted = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--emails" || a === "-e") {
      const val = argv[i + 1] ?? "";
      i++;
      emails = val
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--confirm") {
      confirm = true;
    } else if (a === "--include-deleted") {
      includeDeleted = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return { emails, confirm, includeDeleted };
}

function printUsage(): void {
  console.log(`
🧹 db:clean-test — Hard-delete users và CASCADE toàn bộ dữ liệu liên quan.

Usage:
  npm run db:clean-test
    → List TẤT CẢ users đang active + counts (preview only, KHÔNG sửa gì).

  npm run db:clean-test -- --include-deleted
    → List cả users đã soft-deleted (deleted_at != NULL).

  npm run db:clean-test -- --emails u1@test.local,u2@test.local
    → Preview riêng các email được chỉ định (kể cả soft-deleted).
      Vẫn KHÔNG xóa gì.

  npm run db:clean-test -- --emails u1@test.local,u2@test.local --confirm
    → THỰC SỰ HARD-DELETE các user đó. CASCADE sẽ xóa toàn bộ:
      tags, todos, notes (+ links + FTS), habits + logs,
      checklist_templates (user-created), runs + run_items, devices.

Safety:
  • REFUSE xóa SYSTEM_USER_ID (template hệ thống dùng chung).
  • REFUSE xóa user có is_admin = 1.
  • Hard delete KHÔNG undo. LUÔN preview trước, đối chiếu email + counts
    rồi mới chạy với --confirm.
`);
}

type Counts = {
  tags: number;
  todos: number;
  notes: number;
  habits: number;
  habit_logs: number;
  user_templates: number;
  runs: number;
  devices: number;
};

type UserSummary = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: number;
  created_at: string;
  deleted_at: string | null;
  counts: Counts;
};

async function getCounts(userId: string): Promise<Counts> {
  const res = await turso.execute({
    sql: `SELECT
      (SELECT COUNT(*) FROM tags WHERE user_id = ?) AS tags,
      (SELECT COUNT(*) FROM todos WHERE user_id = ?) AS todos,
      (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS notes,
      (SELECT COUNT(*) FROM habits WHERE user_id = ?) AS habits,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id = ?)) AS habit_logs,
      (SELECT COUNT(*) FROM checklist_templates WHERE user_id = ? AND is_system = 0) AS user_templates,
      (SELECT COUNT(*) FROM checklist_runs WHERE user_id = ?) AS runs,
      (SELECT COUNT(*) FROM devices WHERE user_id = ?) AS devices`,
    args: [userId, userId, userId, userId, userId, userId, userId, userId],
  });
  const c = res.rows[0] as unknown as Record<string, unknown>;
  return {
    tags: Number(c.tags),
    todos: Number(c.todos),
    notes: Number(c.notes),
    habits: Number(c.habits),
    habit_logs: Number(c.habit_logs),
    user_templates: Number(c.user_templates),
    runs: Number(c.runs),
    devices: Number(c.devices),
  };
}

async function listUsers(
  emails: string[] | null,
  includeDeleted: boolean,
): Promise<UserSummary[]> {
  const where: string[] = ["id != ?"];
  const args: (string | number)[] = [SYSTEM_USER_ID];

  if (emails && emails.length > 0) {
    const placeholders = emails.map(() => "?").join(", ");
    where.push(`LOWER(email) IN (${placeholders})`);
    args.push(...emails);
    // Khi chỉ định email → bao gồm cả soft-deleted để user thấy hết.
  } else if (!includeDeleted) {
    where.push("deleted_at IS NULL");
  }

  const sql = `SELECT id, email, display_name, is_admin, created_at, deleted_at
               FROM users
               WHERE ${where.join(" AND ")}
               ORDER BY created_at DESC`;
  const res = await turso.execute({ sql, args });
  const rows = res.rows as unknown as Record<string, unknown>[];

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id as string,
      email: row.email as string,
      display_name: (row.display_name as string | null) ?? null,
      is_admin: Number(row.is_admin),
      created_at: row.created_at as string,
      deleted_at: (row.deleted_at as string | null) ?? null,
      counts: await getCounts(row.id as string),
    })),
  );
}

function printUsers(users: UserSummary[]): void {
  if (users.length === 0) {
    console.log("  (không có user nào khớp)\n");
    return;
  }
  for (const u of users) {
    const created = u.created_at.slice(0, 10);
    const deletedTag = u.deleted_at ? "  ✗ SOFT-DELETED" : "";
    const adminTag = u.is_admin ? "  [ADMIN]" : "";
    console.log("");
    console.log(`  📧 ${u.email}${adminTag}${deletedTag}`);
    console.log(`     id:      ${u.id}`);
    console.log(`     created: ${created}`);
    console.log(
      `     data:    tags=${u.counts.tags}  todos=${u.counts.todos}  notes=${u.counts.notes}  ` +
        `habits=${u.counts.habits} (logs=${u.counts.habit_logs})  ` +
        `templates=${u.counts.user_templates}  runs=${u.counts.runs}  devices=${u.counts.devices}`,
    );
  }
  console.log("");
}

async function deleteUsers(users: UserSummary[]): Promise<void> {
  for (const u of users) {
    if (u.id === SYSTEM_USER_ID) {
      throw new Error("REFUSE: SYSTEM_USER_ID không được xóa.");
    }
    if (u.is_admin === 1) {
      throw new Error(
        `REFUSE: ${u.email} đang có is_admin=1. Bỏ flag is_admin qua admin web hoặc UPDATE manual trước khi xóa.`,
      );
    }
  }
  const ids = users.map((u) => u.id);
  const placeholders = ids.map(() => "?").join(", ");
  const res = await turso.execute({
    sql: `DELETE FROM users WHERE id IN (${placeholders})`,
    args: ids,
  });
  console.log(
    `\n✅ Đã hard-delete ${res.rowsAffected} user(s). CASCADE đã xóa toàn bộ data liên quan.`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.emails && args.emails.length > 0) {
    console.log(`\n🔍 Preview ${args.emails.length} email được chỉ định...`);
    const users = await listUsers(args.emails, true);
    printUsers(users);

    const foundEmails = new Set(users.map((u) => u.email.toLowerCase()));
    const notFound = args.emails.filter((e) => !foundEmails.has(e));
    if (notFound.length > 0) {
      console.log(`  ⚠️  Không tìm thấy: ${notFound.join(", ")}\n`);
    }

    if (!args.confirm) {
      console.log("[DRY RUN] Không có gì bị xóa.");
      console.log("Thêm cờ --confirm để thực thi xóa.\n");
      return;
    }

    if (users.length === 0) {
      console.log("Không có user hợp lệ để xóa.\n");
      return;
    }

    await deleteUsers(users);
    return;
  }

  console.log("\n📋 Danh sách users hiện có:");
  const users = await listUsers(null, args.includeDeleted);
  printUsers(users);
  console.log(
    `Tổng: ${users.length} user${args.includeDeleted ? " (bao gồm soft-deleted)" : " active"}.`,
  );
  printUsage();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
