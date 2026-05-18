import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

const ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const randomPassword = (bytes = 12): string =>
  randomBytes(bytes).toString("base64url");
