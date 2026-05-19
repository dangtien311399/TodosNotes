import * as tplRepo from "../repositories/checklist-templates.js";
import * as runsRepo from "../repositories/checklist-runs.js";
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  UpsertTemplateItemInput,
  PatchTemplateItemInput,
  ReorderItemsInput,
  ListTemplatesQueryInput,
  StartRunInput,
  UpdateRunItemInput,
  ListRunsQueryInput,
} from "../schemas/api/checklists.js";

export class ServiceError extends Error {
  constructor(public code: "not_found" | "incomplete_required") {
    super(code);
  }
}

const wrapRun = (e: unknown): never => {
  if (e instanceof runsRepo.RunRepoError) {
    throw new ServiceError(e.code);
  }
  throw e;
};

// ============================================================
// Templates
// ============================================================

export const listTemplates = async (
  userId: string,
  query: ListTemplatesQueryInput
): Promise<{
  items: (tplRepo.TemplateRow & { items_count?: number })[];
}> => {
  const items = await tplRepo.listTemplatesForUser(userId, query);
  return { items };
};

export const getTemplateDetail = async (
  userId: string,
  id: string
): Promise<{
  template: tplRepo.TemplateRow;
  items: tplRepo.ItemRow[];
}> => {
  const template = await tplRepo.getTemplateForUser(id, userId);
  if (!template) throw new ServiceError("not_found");
  const items = await tplRepo.listItems(id);
  return { template, items };
};

export const createTemplate = async (
  userId: string,
  input: CreateTemplateInput
): Promise<{ template: tplRepo.TemplateRow; items: tplRepo.ItemRow[] }> => {
  const id = await tplRepo.createUserTemplate(userId, {
    title: input.title,
    description: input.description ?? null,
    icon: input.icon ?? null,
    category: input.category ?? null,
    items: input.items.map((i) => ({
      title: i.title,
      description: i.description ?? null,
      is_required: i.is_required ? 1 : 0,
    })),
  });
  const template = await tplRepo.getTemplateForUser(id, userId);
  if (!template) throw new ServiceError("not_found");
  const items = await tplRepo.listItems(id);
  return { template, items };
};

export const updateTemplate = async (
  userId: string,
  id: string,
  patch: UpdateTemplateInput
): Promise<tplRepo.TemplateRow> => {
  const ok = await tplRepo.updateUserTemplate(id, userId, patch);
  if (!ok) throw new ServiceError("not_found");
  const row = await tplRepo.getTemplateForUser(id, userId);
  if (!row) throw new ServiceError("not_found");
  return row;
};

export const deleteTemplate = async (userId: string, id: string): Promise<void> => {
  const ok = await tplRepo.softDeleteUserTemplate(id, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const addTemplateItem = async (
  userId: string,
  templateId: string,
  input: UpsertTemplateItemInput
): Promise<tplRepo.ItemRow> => {
  const itemId = await tplRepo.addItemUserScoped(templateId, userId, {
    title: input.title,
    description: input.description ?? null,
    is_required: input.is_required ? 1 : 0,
  });
  if (!itemId) throw new ServiceError("not_found");
  const item = await tplRepo.getItemById(itemId);
  if (!item) throw new ServiceError("not_found");
  return item;
};

export const patchTemplateItem = async (
  userId: string,
  templateId: string,
  itemId: string,
  patch: PatchTemplateItemInput
): Promise<tplRepo.ItemRow> => {
  const ok = await tplRepo.updateItemUserScoped(itemId, templateId, userId, {
    title: patch.title,
    description: patch.description,
    is_required: patch.is_required === undefined ? undefined : patch.is_required ? 1 : 0,
  });
  if (!ok) throw new ServiceError("not_found");
  const item = await tplRepo.getItemById(itemId);
  if (!item) throw new ServiceError("not_found");
  return item;
};

export const deleteTemplateItem = async (
  userId: string,
  templateId: string,
  itemId: string
): Promise<void> => {
  const ok = await tplRepo.deleteItemUserScoped(itemId, templateId, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const reorderTemplateItems = async (
  userId: string,
  templateId: string,
  body: ReorderItemsInput
): Promise<tplRepo.ItemRow[]> => {
  const ok = await tplRepo.reorderItemsUserScoped(
    templateId,
    userId,
    body.item_ids
  );
  if (!ok) throw new ServiceError("not_found");
  return tplRepo.listItems(templateId);
};

// ============================================================
// Runs
// ============================================================

export const startRun = async (
  userId: string,
  input: StartRunInput
): Promise<{ run: runsRepo.RunRow; items: runsRepo.RunItemDetail[] }> => {
  try {
    const runId = await runsRepo.startRun(
      userId,
      input.template_id,
      input.name ?? null
    );
    const run = await runsRepo.getRunById(runId, userId);
    if (!run) throw new ServiceError("not_found");
    const items = await runsRepo.listRunItems(runId);
    return { run, items };
  } catch (e) {
    return wrapRun(e);
  }
};

export const listRuns = async (
  userId: string,
  query: ListRunsQueryInput
): Promise<{ rows: runsRepo.RunRow[]; nextCursor: string | null }> => {
  return runsRepo.listRunsByUser(userId, query);
};

export const getRunDetail = async (
  userId: string,
  id: string
): Promise<{ run: runsRepo.RunRow; items: runsRepo.RunItemDetail[] }> => {
  const run = await runsRepo.getRunById(id, userId);
  if (!run) throw new ServiceError("not_found");
  const items = await runsRepo.listRunItems(id);
  return { run, items };
};

export const updateRunItem = async (
  userId: string,
  _runId: string,
  itemId: string,
  patch: UpdateRunItemInput
): Promise<runsRepo.RunItemDetail> => {
  const ok = await runsRepo.updateRunItem(itemId, userId, patch);
  if (!ok) throw new ServiceError("not_found");
  const items = await runsRepo.listRunItems(_runId);
  const updated = items.find((i) => i.id === itemId);
  if (!updated) throw new ServiceError("not_found");
  return updated;
};

export const completeRun = async (userId: string, id: string): Promise<void> => {
  try {
    await runsRepo.completeRun(id, userId);
  } catch (e) {
    wrapRun(e);
  }
};

export const abandonRun = async (userId: string, id: string): Promise<void> => {
  const ok = await runsRepo.abandonRun(id, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const deleteRun = async (userId: string, id: string): Promise<void> => {
  const ok = await runsRepo.deleteRun(id, userId);
  if (!ok) throw new ServiceError("not_found");
};
