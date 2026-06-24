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
import { SyncNotePayloadSchema } from "../schemas/api/notes.js";
import {
  quillDeltaToPlainText,
  type QuillDelta,
} from "../schemas/quill-delta.js";

export class ServiceError extends Error {
  constructor(
    public code: "not_found" | "duplicate" | "self_link" | "bad_input"
  ) {
    super(code);
  }
}

const wrapRepoError = (e: unknown): never => {
  if (e instanceof notesRepo.RepoError) {
    throw new ServiceError(e.code);
  }
  throw e;
};

type NoteContentInput = {
  type?: "free" | "cornell";
  body?: string | null;
  body_delta?: QuillDelta | null;
  cornell_cue?: string | null;
  cornell_cue_delta?: QuillDelta | null;
  cornell_summary?: string | null;
  cornell_summary_delta?: QuillDelta | null;
};

type NoteContentState = Required<NoteContentInput> & {
  content_format: notesRepo.NoteContentFormat;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const resolveSection = (
  currentPlain: string | null,
  currentDelta: QuillDelta | null,
  patch: NoteContentInput,
  plainKey: "body" | "cornell_cue" | "cornell_summary",
  deltaKey: "body_delta" | "cornell_cue_delta" | "cornell_summary_delta"
): { plain: string | null; delta: QuillDelta | null } => {
  const hasPlain = hasOwn(patch, plainKey);
  const hasDelta = hasOwn(patch, deltaKey);

  if (hasDelta) {
    const delta = patch[deltaKey] ?? null;
    return {
      plain:
        delta !== null
          ? quillDeltaToPlainText(delta)
          : hasPlain
            ? patch[plainKey] ?? null
            : currentPlain,
      delta,
    };
  }

  if (hasPlain) {
    return {
      plain: patch[plainKey] ?? null,
      // A direct plain-text edit invalidates the previous rich representation.
      delta: null,
    };
  }

  return { plain: currentPlain, delta: currentDelta };
};

const normalizeNoteContent = (
  current: notesRepo.NoteRow | null,
  patch: NoteContentInput
): NoteContentState => {
  const type = patch.type ?? current?.type ?? "free";
  const body = resolveSection(
    current?.body ?? null,
    current?.body_delta ?? null,
    patch,
    "body",
    "body_delta"
  );
  let cue = resolveSection(
    current?.cornell_cue ?? null,
    current?.cornell_cue_delta ?? null,
    patch,
    "cornell_cue",
    "cornell_cue_delta"
  );
  let summary = resolveSection(
    current?.cornell_summary ?? null,
    current?.cornell_summary_delta ?? null,
    patch,
    "cornell_summary",
    "cornell_summary_delta"
  );

  if (type === "free") {
    cue = { plain: null, delta: null };
    summary = { plain: null, delta: null };
  } else if (!cue.plain?.trim() || !summary.plain?.trim()) {
    throw new ServiceError("bad_input");
  }

  const contentFormat: notesRepo.NoteContentFormat =
    body.delta !== null || cue.delta !== null || summary.delta !== null
      ? "quill_delta_v1"
      : "plain";

  return {
    type,
    body: body.plain,
    body_delta: body.delta,
    cornell_cue: cue.plain,
    cornell_cue_delta: cue.delta,
    cornell_summary: summary.plain,
    cornell_summary_delta: summary.delta,
    content_format: contentFormat,
  };
};

export const normalizeSyncNoteContent = (
  current: notesRepo.NoteRow | null,
  payload: Record<string, unknown>
): NoteContentState => {
  const parsed = SyncNotePayloadSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError("bad_input");
  return normalizeNoteContent(current, parsed.data);
};

export const createNote = async (
  userId: string,
  input: CreateNoteInput
): Promise<{
  note: notesRepo.NoteRow;
  tags: tagsRepo.TagRow[];
}> => {
  const content = normalizeNoteContent(null, input);
  const note = await notesRepo.createNote({
    user_id: userId,
    title: input.title,
    ...content,
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
  const current = await notesRepo.getNoteByIdScoped(id, userId);
  if (!current) throw new ServiceError("not_found");
  const content = normalizeNoteContent(current, patch);
  const finalPatch: notesRepo.UpdateNotePatch = {
    ...patch,
    ...content,
  };
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
