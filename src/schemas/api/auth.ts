import { z } from "zod";

export const AuthRegisterSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(200),
  display_name: z.string().trim().max(100).optional(),
});

export type AuthRegisterInput = z.infer<typeof AuthRegisterSchema>;

export const AuthLoginSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export type AuthLoginInput = z.infer<typeof AuthLoginSchema>;
