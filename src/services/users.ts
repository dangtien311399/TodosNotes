import * as repo from "../repositories/users.js";
import { hashPassword, randomPassword } from "../utils/password.js";

export const listUsers = repo.listUsers;
export const getUserById = repo.getUserById;
export const disableUser = repo.disableUser;
export const enableUser = repo.enableUser;
export const updateUserProfile = repo.updateUserProfile;

export const resetUserPassword = async (id: string): Promise<string> => {
  const plain = randomPassword(12);
  const hash = await hashPassword(plain);
  await repo.updateUserPassword(id, hash);
  return plain;
};
