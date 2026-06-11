import { turso } from "../config/db.js";
import { newId, SYSTEM_USER_ID } from "../utils/id.js";
import { nowISO } from "../utils/time.js";

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class CategoryRepoError extends Error {
  constructor(public code: "not_found" | "duplicate") {
    super(code);
  }
}

const CATEGORY_COLUMNS =
  "id, user_id, name, slug, icon, color, sort_order, is_system, created_at, updated_at, deleted_at";

const mapCategory = (row: Record<string, unknown>): CategoryRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  name: row.name as string,
  slug: row.slug as string,
  icon: (row.icon as string | null) ?? null,
  color: row.color as string,
  sort_order: Number(row.sort_order),
  is_system: Number(row.is_system),
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

const isUniqueViolation = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE/i.test(msg);
};

export const slugifyCategory = (value: string): string => {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
};

export const listCategoriesForUser = async (
  userId: string,
  opts: { scope: "system" | "own" | "all" }
): Promise<CategoryRow[]> => {
  const where: string[] = ["deleted_at IS NULL"];
  const args: (string | number)[] = [];

  if (opts.scope === "system") {
    where.push("is_system = 1");
  } else if (opts.scope === "own") {
    where.push("is_system = 0 AND user_id = ?");
    args.push(userId);
  } else {
    where.push("(is_system = 1 OR (is_system = 0 AND user_id = ?))");
    args.push(userId);
  }

  const res = await turso.execute({
    sql: `SELECT ${CATEGORY_COLUMNS}
          FROM checklist_categories
          WHERE ${where.join(" AND ")}
          ORDER BY is_system DESC, sort_order ASC, name ASC`,
    args,
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapCategory);
};

export const getCategoryForUser = async (
  id: string,
  userId: string
): Promise<CategoryRow | null> => {
  const res = await turso.execute({
    sql: `SELECT ${CATEGORY_COLUMNS}
          FROM checklist_categories
          WHERE id = ? AND deleted_at IS NULL
            AND (is_system = 1 OR (is_system = 0 AND user_id = ?))`,
    args: [id, userId],
  });
  if (res.rows.length === 0) return null;
  return mapCategory(res.rows[0] as unknown as Record<string, unknown>);
};

export const getUserCategoryById = async (
  id: string,
  userId: string
): Promise<CategoryRow | null> => {
  const res = await turso.execute({
    sql: `SELECT ${CATEGORY_COLUMNS}
          FROM checklist_categories
          WHERE id = ? AND user_id = ? AND is_system = 0 AND deleted_at IS NULL`,
    args: [id, userId],
  });
  if (res.rows.length === 0) return null;
  return mapCategory(res.rows[0] as unknown as Record<string, unknown>);
};

export const createUserCategory = async (
  userId: string,
  input: {
    name: string;
    slug?: string;
    icon?: string | null;
    color?: string;
    sort_order?: number;
  }
): Promise<CategoryRow> => {
  const id = newId();
  const now = nowISO();
  const slug = input.slug ?? slugifyCategory(input.name);
  try {
    await turso.execute({
      sql: `INSERT INTO checklist_categories
            (id, user_id, name, slug, icon, color, sort_order, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        id,
        userId,
        input.name,
        slug,
        input.icon ?? null,
        input.color ?? "#888888",
        input.sort_order ?? 0,
        now,
        now,
      ],
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new CategoryRepoError("duplicate");
    throw e;
  }

  const row = await getUserCategoryById(id, userId);
  if (!row) throw new Error("createUserCategory: row missing");
  return row;
};

export const createSystemCategory = async (
  input: {
    name: string;
    slug?: string;
    icon?: string | null;
    color?: string;
    sort_order?: number;
  }
): Promise<CategoryRow> => {
  const id = newId();
  const now = nowISO();
  const slug = input.slug ?? slugifyCategory(input.name);
  try {
    await turso.execute({
      sql: `INSERT INTO checklist_categories
            (id, user_id, name, slug, icon, color, sort_order, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [
        id,
        SYSTEM_USER_ID,
        input.name,
        slug,
        input.icon ?? null,
        input.color ?? "#888888",
        input.sort_order ?? 0,
        now,
        now,
      ],
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new CategoryRepoError("duplicate");
    throw e;
  }

  const row = await getCategoryForUser(id, SYSTEM_USER_ID);
  if (!row) throw new Error("createSystemCategory: row missing");
  return row;
};

export const updateUserCategory = async (
  id: string,
  userId: string,
  patch: {
    name?: string;
    slug?: string;
    icon?: string | null;
    color?: string;
    sort_order?: number;
  }
): Promise<boolean> => {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.slug !== undefined) {
    sets.push("slug = ?");
    args.push(patch.slug);
  }
  if (patch.icon !== undefined) {
    sets.push("icon = ?");
    args.push(patch.icon);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    args.push(patch.color);
  }
  if (patch.sort_order !== undefined) {
    sets.push("sort_order = ?");
    args.push(patch.sort_order);
  }
  if (sets.length === 0) return true;

  sets.push("updated_at = ?");
  args.push(nowISO());
  args.push(id, userId);

  try {
    const res = await turso.execute({
      sql: `UPDATE checklist_categories
            SET ${sets.join(", ")}
            WHERE id = ? AND user_id = ? AND is_system = 0 AND deleted_at IS NULL`,
      args,
    });
    return res.rowsAffected > 0;
  } catch (e) {
    if (isUniqueViolation(e)) throw new CategoryRepoError("duplicate");
    throw e;
  }
};

export const softDeleteUserCategory = async (
  id: string,
  userId: string
): Promise<boolean> => {
  const now = nowISO();
  const res = await turso.batch(
    [
      {
        sql: `UPDATE checklist_categories
              SET deleted_at = ?, updated_at = ?
              WHERE id = ? AND user_id = ? AND is_system = 0 AND deleted_at IS NULL`,
        args: [now, now, id, userId],
      },
      {
        sql: `UPDATE checklist_templates
              SET category_id = NULL, category = NULL, updated_at = ?
              WHERE category_id = ? AND user_id = ? AND is_system = 0 AND deleted_at IS NULL`,
        args: [now, id, userId],
      },
    ],
    "write"
  );
  return (res[0].rowsAffected ?? 0) > 0;
};
