import { env } from "../config/env.js";
import { verifyPassword } from "../utils/password.js";

export const verifyAdminCredentials = async (
  username: string,
  password: string
): Promise<boolean> => {
  if (username !== env.ADMIN_USERNAME) return false;
  return verifyPassword(password, env.ADMIN_PASSWORD_HASH);
};
