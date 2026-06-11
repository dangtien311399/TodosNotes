import { z } from "zod";

export const ListTagSuggestionsQuerySchema = z.object({
  scope: z.enum(["todo", "note"]),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(64).optional(),
});
export type ListTagSuggestionsQueryInput = z.infer<
  typeof ListTagSuggestionsQuerySchema
>;
