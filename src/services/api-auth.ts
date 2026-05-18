import type { FastifyInstance } from "fastify";
import * as usersRepo from "../repositories/users.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export class AuthError extends Error {
  constructor(public code: "email_taken" | "invalid_credentials") {
    super(code);
  }
}

export const registerUser = async (
  email: string,
  password: string,
  display_name?: string
): Promise<usersRepo.UserRow> => {
  const existing = await usersRepo.findUserByEmail(email);
  if (existing) throw new AuthError("email_taken");
  const password_hash = await hashPassword(password);
  return usersRepo.createUser({ email, password_hash, display_name });
};

export const loginUser = async (
  email: string,
  password: string
): Promise<usersRepo.UserRow> => {
  const user = await usersRepo.findUserByEmail(email);
  if (!user) throw new AuthError("invalid_credentials");
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw new AuthError("invalid_credentials");
  return user;
};

type JwtNamespaced = {
  user: { sign: (payload: { sub: string }) => string };
};

export const signUserToken = (app: FastifyInstance, userId: string): string => {
  const jwt = app.jwt as unknown as JwtNamespaced;
  return jwt.user.sign({ sub: userId });
};

export const publicUser = (
  u: usersRepo.UserRow
): {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
} => ({
  id: u.id,
  email: u.email,
  display_name: u.display_name,
  avatar_url: u.avatar_url,
  timezone: u.timezone,
});
