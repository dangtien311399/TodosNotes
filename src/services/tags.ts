import * as tagsRepo from "../repositories/tags.js";
import type { ListTagSuggestionsQueryInput } from "../schemas/api/tags.js";

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
