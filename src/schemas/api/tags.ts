import { z } from "zod";

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be hex like #aabbcc");

export const ListTagsQuerySchema = z.object({
  scope: z.enum(["todo", "note", "all"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  q: z.string().trim().min(1).max(64).optional(),
});
export type ListTagsQueryInput = z.infer<typeof ListTagsQuerySchema>;

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1).max(64),
  color: HexColor.optional(),
});
export type CreateTagInput = z.infer<typeof CreateTagSchema>;

export const UpdateTagSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  color: HexColor.optional(),
});
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;

export const ListTagSuggestionsQuerySchema = z.object({
  scope: z.enum(["todo", "note"]),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(64).optional(),
});
export type ListTagSuggestionsQueryInput = z.infer<
  typeof ListTagSuggestionsQuerySchema
>;
