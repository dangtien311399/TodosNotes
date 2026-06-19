import { z } from "zod";

export const RegisterNotificationTokenSchema = z.object({
  userId: z.uuid(),
  token: z.string().trim().min(1).max(4096),
});

export type RegisterNotificationTokenInput = z.infer<
  typeof RegisterNotificationTokenSchema
>;
