import { z } from "zod";

export const UserEditSchema = z.object({
  timezone: z.string().min(1).max(64),
  is_admin: z
    .union([z.literal("on"), z.literal("1"), z.literal("0"), z.undefined()])
    .transform((v) => (v === "on" || v === "1" ? 1 : 0)),
});

export type UserEditInput = z.infer<typeof UserEditSchema>;
