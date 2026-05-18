import { turso } from "../config/db.js";
import { newId, SYSTEM_USER_ID } from "../utils/id.js";
import { nowISO } from "../utils/time.js";

export type TemplateRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  is_system: number;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ItemRow = {
  id: string;
  template_id: string;
  position: number;
  title: string;
  description: string | null;
  is_required: number;
  created_at: string;
  updated_at: string;
};

const mapTemplate = (row: Record<string, unknown>): TemplateRow => ({
  id: row.id as string,
  user_id: row.user_id as string,
  title: row.title as string,
  description: (row.description as string | null) ?? null,
  icon: (row.icon as string | null) ?? null,
  category: (row.category as string | null) ?? null,
  is_system: Number(row.is_system),
  times_used: Number(row.times_used),
  last_used_at: (row.last_used_at as string | null) ?? null,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
  deleted_at: (row.deleted_at as string | null) ?? null,
});

const mapItem = (row: Record<string, unknown>): ItemRow => ({
  id: row.id as string,
  template_id: row.template_id as string,
  position: Number(row.position),
  title: row.title as string,
  description: (row.description as string | null) ?? null,
  is_required: Number(row.is_required),
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
});

export const listSystemTemplates = async (filter: "all" | "active" | "deleted"): Promise<TemplateRow[]> => {
  const where: string[] = ["is_system = 1"];
  if (filter === "active") where.push("deleted_at IS NULL");
  if (filter === "deleted") where.push("deleted_at IS NOT NULL");
  const res = await turso.execute({
    sql: `SELECT * FROM checklist_templates WHERE ${where.join(" AND ")} ORDER BY created_at DESC`,
    args: [],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapTemplate);
};

export const getSystemTemplateById = async (id: string): Promise<TemplateRow | null> => {
  const res = await turso.execute({
    sql: "SELECT * FROM checklist_templates WHERE id = ? AND is_system = 1",
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return mapTemplate(res.rows[0] as unknown as Record<string, unknown>);
};

export const listItems = async (templateId: string): Promise<ItemRow[]> => {
  const res = await turso.execute({
    sql: "SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY position ASC",
    args: [templateId],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map(mapItem);
};

export const getItemById = async (id: string): Promise<ItemRow | null> => {
  const res = await turso.execute({
    sql: "SELECT * FROM checklist_template_items WHERE id = ?",
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return mapItem(res.rows[0] as unknown as Record<string, unknown>);
};

export type CreateTemplateInput = {
  title: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
  items: { title: string; description?: string | null; is_required: number }[];
};

export const createSystemTemplate = async (input: CreateTemplateInput): Promise<string> => {
  const templateId = newId();
  const now = nowISO();

  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO checklist_templates
        (id, user_id, title, description, icon, category, times_used, is_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      args: [
        templateId,
        SYSTEM_USER_ID,
        input.title,
        input.description ?? null,
        input.icon ?? null,
        input.category ?? null,
        now,
        now,
      ],
    },
    ...input.items.map((it, idx) => ({
      sql: `INSERT INTO checklist_template_items
        (id, template_id, position, title, description, is_required, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newId(), templateId, idx + 1, it.title, it.description ?? null, it.is_required, now, now] as (string | number | null)[],
    })),
  ];

  await turso.batch(stmts, "write");
  return templateId;
};

export const updateSystemTemplate = async (
  id: string,
  patch: { title?: string; description?: string | null; icon?: string | null; category?: string | null }
): Promise<void> => {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); args.push(patch.title); }
  if (patch.description !== undefined) { sets.push("description = ?"); args.push(patch.description); }
  if (patch.icon !== undefined) { sets.push("icon = ?"); args.push(patch.icon); }
  if (patch.category !== undefined) { sets.push("category = ?"); args.push(patch.category); }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  args.push(nowISO());
  args.push(id);
  await turso.execute({
    sql: `UPDATE checklist_templates SET ${sets.join(", ")} WHERE id = ? AND is_system = 1`,
    args,
  });
};

export const softDeleteSystemTemplate = async (id: string): Promise<void> => {
  const now = nowISO();
  await turso.execute({
    sql: "UPDATE checklist_templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND is_system = 1 AND deleted_at IS NULL",
    args: [now, now, id],
  });
};

export const addItem = async (
  templateId: string,
  input: { title: string; description?: string | null; is_required: number }
): Promise<void> => {
  const now = nowISO();
  // Tính position kế tiếp
  const maxRes = await turso.execute({
    sql: "SELECT COALESCE(MAX(position), 0) AS m FROM checklist_template_items WHERE template_id = ?",
    args: [templateId],
  });
  const nextPos = Number((maxRes.rows[0] as Record<string, unknown>).m) + 1;
  await turso.execute({
    sql: `INSERT INTO checklist_template_items
      (id, template_id, position, title, description, is_required, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [newId(), templateId, nextPos, input.title, input.description ?? null, input.is_required, now, now],
  });
};

export const updateItem = async (
  id: string,
  patch: { title?: string; description?: string | null; is_required?: number }
): Promise<void> => {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); args.push(patch.title); }
  if (patch.description !== undefined) { sets.push("description = ?"); args.push(patch.description); }
  if (patch.is_required !== undefined) { sets.push("is_required = ?"); args.push(patch.is_required); }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  args.push(nowISO());
  args.push(id);
  await turso.execute({
    sql: `UPDATE checklist_template_items SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
};

export const deleteItem = async (id: string): Promise<void> => {
  await turso.execute({
    sql: "DELETE FROM checklist_template_items WHERE id = ?",
    args: [id],
  });
};
