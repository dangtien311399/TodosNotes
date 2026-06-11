import { z } from "zod";

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be hex like #aabbcc");

const ItemInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  is_required: z.boolean().optional().default(true),
});

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case")
    .optional(),
  icon: z.string().max(50).nullable().optional(),
  color: HexColor.optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case")
    .optional(),
  icon: z.string().max(50).nullable().optional(),
  color: HexColor.optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

export const ListCategoriesQuerySchema = z.object({
  scope: z.enum(["system", "own", "all"]).optional().default("all"),
});
export type ListCategoriesQueryInput = z.infer<typeof ListCategoriesQuerySchema>;

export const CreateTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  category_id: z.uuid().nullable().optional(),
  items: z.array(ItemInput).min(1).max(50),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  category_id: z.uuid().nullable().optional(),
});
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

export const UpsertTemplateItemSchema = ItemInput;
export type UpsertTemplateItemInput = z.infer<typeof UpsertTemplateItemSchema>;

export const PatchTemplateItemSchema = ItemInput.partial();
export type PatchTemplateItemInput = z.infer<typeof PatchTemplateItemSchema>;

export const ReorderItemsSchema = z.object({
  item_ids: z.array(z.uuid()).min(1).max(50),
});
export type ReorderItemsInput = z.infer<typeof ReorderItemsSchema>;

export const ListTemplatesQuerySchema = z.object({
  scope: z.enum(["system", "own", "all"]).optional().default("all"),
  category: z.string().max(50).optional(),
  category_id: z.uuid().optional(),
});
export type ListTemplatesQueryInput = z.infer<typeof ListTemplatesQuerySchema>;

export const StartRunSchema = z.object({
  template_id: z.uuid(),
  name: z.string().trim().max(200).optional(),
});
export type StartRunInput = z.infer<typeof StartRunSchema>;

export const UpdateRunItemSchema = z.object({
  status: z.enum(["pending", "done", "skipped"]),
  note: z.string().max(1000).nullable().optional(),
});
export type UpdateRunItemInput = z.infer<typeof UpdateRunItemSchema>;

export const ListRunsQuerySchema = z.object({
  status: z.enum(["in_progress", "completed", "abandoned"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRunsQueryInput = z.infer<typeof ListRunsQuerySchema>;
