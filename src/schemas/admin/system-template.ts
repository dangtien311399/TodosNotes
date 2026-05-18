import { z } from "zod";

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

const checkboxToInt = z
  .union([z.literal("on"), z.literal("1"), z.literal("0"), z.undefined(), z.literal("")])
  .transform((v) => (v === "on" || v === "1" ? 1 : 0));

export const TemplateMetaSchema = z.object({
  title: z.string().min(1, "Bắt buộc").max(200),
  description: optionalText,
  icon: optionalText,
  category: optionalText,
});

/**
 * Form tạo mới: meta + 1 textarea `items_text`, mỗi dòng = 1 item title.
 * Có thể bắt đầu bằng "- " hoặc số "1. " — sẽ bị strip.
 * Items mới mặc định is_required = 1.
 */
export const NewTemplateSchema = TemplateMetaSchema.extend({
  items_text: z.string().max(10_000).default(""),
});

export const ItemAddSchema = z.object({
  title: z.string().min(1, "Bắt buộc").max(200),
  description: optionalText,
  is_required: checkboxToInt,
});

export const ItemEditSchema = ItemAddSchema;

export type TemplateMetaInput = z.infer<typeof TemplateMetaSchema>;
export type NewTemplateInput = z.infer<typeof NewTemplateSchema>;

const LINE_PREFIX = /^\s*(?:[-*•]|\d+[.)])\s+/;

export function parseItemsText(text: string): {
  title: string;
  description: null;
  is_required: number;
}[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(LINE_PREFIX, "").trim())
    .filter((l) => l.length > 0 && l.length <= 200)
    .map((title) => ({ title, description: null, is_required: 1 }));
}
