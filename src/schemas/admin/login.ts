import { z } from "zod";

export const LoginSchema = z.object({
  username: z.string().min(1, "Bắt buộc"),
  password: z.string().min(1, "Bắt buộc"),
});

export type LoginInput = z.infer<typeof LoginSchema>;
