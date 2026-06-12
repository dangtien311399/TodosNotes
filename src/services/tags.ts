import * as tagsRepo from "../repositories/tags.js";
import type {
  CreateTagInput,
  ListTagsQueryInput,
  ListTagSuggestionsQueryInput,
  UpdateTagInput,
} from "../schemas/api/tags.js";

export class ServiceError extends Error {
  constructor(public code: "not_found" | "duplicate") {
    super(code);
  }
}

const wrapRepo = (e: unknown): never => {
  if (e instanceof tagsRepo.TagRepoError) {
    throw new ServiceError(e.code);
  }
  throw e;
};

export const listTags = async (
  userId: string,
  query: ListTagsQueryInput
): Promise<{ items: tagsRepo.TagListRow[] }> => {
  const items = await tagsRepo.listTagsByUser(userId, {
    scope: query.scope,
    limit: query.limit,
    q: query.q,
  });
  return { items };
};

export const createTag = async (
  userId: string,
  input: CreateTagInput
): Promise<{ tag: tagsRepo.TagRow }> => {
  const tag = await tagsRepo.findOrCreateByName(userId, input.name, input.color);
  return { tag };
};

export const updateTag = async (
  userId: string,
  id: string,
  patch: UpdateTagInput
): Promise<{ tag: tagsRepo.TagRow }> => {
  try {
    const tag = await tagsRepo.updateTag(id, userId, patch);
    if (!tag) throw new ServiceError("not_found");
    return { tag };
  } catch (e) {
    return wrapRepo(e);
  }
};

export const deleteTag = async (userId: string, id: string): Promise<void> => {
  const ok = await tagsRepo.softDeleteTag(id, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const listSuggestions = async (
  userId: string,
  query: ListTagSuggestionsQueryInput
): Promise<tagsRepo.TagSuggestionRow[]> => {
  return tagsRepo.listTagSuggestions(userId, {
    scope: query.scope,
    limit: query.limit,
    q: query.q,
  });
};
