import * as notesRepo from "../repositories/notes.js";
import * as tagsRepo from "../repositories/tags.js";
import type {
  CreateNoteInput,
  UpdateNoteInput,
  NoteLinkInput,
  NoteTodoLinkInput,
  AttachTagInput,
  ListNotesQueryInput,
} from "../schemas/api/notes.js";

export class ServiceError extends Error {
  constructor(public code: "not_found" | "duplicate" | "self_link") {
    super(code);
  }
}

const wrapRepoError = (e: unknown): never => {
  if (e instanceof notesRepo.RepoError) {
    throw new ServiceError(e.code);
  }
  throw e;
};

export const createNote = async (
  userId: string,
  input: CreateNoteInput
): Promise<{
  note: notesRepo.NoteRow;
  tags: tagsRepo.TagRow[];
}> => {
  const note = await notesRepo.createNote({
    user_id: userId,
    title: input.title,
    type: input.type,
    body: input.body ?? null,
    cornell_cue: input.type === "cornell" ? input.cornell_cue : null,
    cornell_summary: input.type === "cornell" ? input.cornell_summary : null,
    is_pinned: input.is_pinned ?? false,
  });

  let tags: tagsRepo.TagRow[] = [];
  if (input.tags && input.tags.length > 0) {
    const resolved = await Promise.all(
      input.tags.map((name) => tagsRepo.findOrCreateByName(userId, name))
    );
    for (const tag of resolved) {
      await notesRepo.attachTagToNote(note.id, tag.id, userId);
    }
    tags = await notesRepo.listNoteTags(note.id);
  }
  return { note, tags };
};

export const listNotes = async (
  userId: string,
  query: ListNotesQueryInput
): Promise<notesRepo.ListResult> => {
  try {
    return await notesRepo.listNotesByUser(userId, {
      cursor: query.cursor,
      limit: query.limit,
      type: query.type,
      pinned: query.pinned,
      q: query.q,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "bad_cursor") {
      throw new ServiceError("not_found"); // route maps separately by message
    }
    throw e;
  }
};

export const getNoteDetail = async (
  userId: string,
  id: string
): Promise<notesRepo.NoteWithRelations> => {
  const detail = await notesRepo.getNoteWithRelations(id, userId);
  if (!detail) throw new ServiceError("not_found");
  return detail;
};

export const updateNote = async (
  userId: string,
  id: string,
  patch: UpdateNoteInput
): Promise<notesRepo.NoteRow> => {
  // Khi chuyển sang type='free', force null cornell_cue/summary để clean data cũ.
  const finalPatch: notesRepo.UpdateNotePatch = { ...patch };
  if (patch.type === "free") {
    finalPatch.cornell_cue = null;
    finalPatch.cornell_summary = null;
  }
  const row = await notesRepo.updateNote(id, userId, finalPatch);
  if (!row) throw new ServiceError("not_found");
  return row;
};

export const deleteNote = async (userId: string, id: string): Promise<void> => {
  const ok = await notesRepo.softDeleteNote(id, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const addLink = async (
  userId: string,
  sourceId: string,
  body: NoteLinkInput
): Promise<notesRepo.NoteLinkRow> => {
  if (sourceId === body.targetId) throw new ServiceError("self_link");
  try {
    return await notesRepo.addNoteLink(
      sourceId,
      body.targetId,
      userId,
      body.label ?? null
    );
  } catch (e) {
    return wrapRepoError(e);
  }
};

export const removeLink = async (
  userId: string,
  sourceId: string,
  targetId: string
): Promise<void> => {
  const ok = await notesRepo.removeNoteLink(sourceId, targetId, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const listBacklinks = async (
  userId: string,
  noteId: string
): Promise<notesRepo.IncomingLinkRow[]> => {
  // verify note thuộc user (tránh leak existence)
  const note = await notesRepo.getNoteByIdScoped(noteId, userId);
  if (!note) throw new ServiceError("not_found");
  return notesRepo.listIncomingLinks(noteId, userId);
};

export const linkTodo = async (
  userId: string,
  noteId: string,
  body: NoteTodoLinkInput
): Promise<notesRepo.NoteTodoLinkRow> => {
  try {
    return await notesRepo.addNoteTodoLink(noteId, body.todoId, userId);
  } catch (e) {
    return wrapRepoError(e);
  }
};

export const unlinkTodo = async (
  userId: string,
  noteId: string,
  todoId: string
): Promise<void> => {
  const ok = await notesRepo.removeNoteTodoLink(noteId, todoId, userId);
  if (!ok) throw new ServiceError("not_found");
};

export const attachTag = async (
  userId: string,
  noteId: string,
  body: AttachTagInput
): Promise<tagsRepo.TagRow> => {
  let tag: tagsRepo.TagRow | null = null;
  if ("tagId" in body) {
    tag = await tagsRepo.getTagById(body.tagId, userId);
    if (!tag) throw new ServiceError("not_found");
  } else {
    tag = await tagsRepo.findOrCreateByName(userId, body.name, body.color);
  }
  try {
    await notesRepo.attachTagToNote(noteId, tag.id, userId);
  } catch (e) {
    return wrapRepoError(e);
  }
  return tag;
};

export const detachTag = async (
  userId: string,
  noteId: string,
  tagId: string
): Promise<void> => {
  const ok = await notesRepo.detachTagFromNote(noteId, tagId, userId);
  if (!ok) throw new ServiceError("not_found");
};
