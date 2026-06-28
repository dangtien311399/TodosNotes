import { z } from "zod";
import {
  QuillDeltaSchema,
  quillDeltaToPlainText,
} from "../quill-delta.js";

const richTextSchema = (maxPlainTextLength: number) =>
  QuillDeltaSchema.superRefine((delta, ctx) => {
    if (quillDeltaToPlainText(delta).length > maxPlainTextLength) {
      ctx.addIssue({
        code: "too_big",
        maximum: maxPlainTextLength,
        origin: "string",
        inclusive: true,
        message: `Plain text extracted from Delta must not exceed ${maxPlainTextLength} characters`,
      });
    }
  });

const BodyDeltaSchema = richTextSchema(100_000);
const CornellDeltaSchema = richTextSchema(10_000);

const Base = z.object({
  title: z.string().trim().min(1).max(500),
  is_pinned: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

const Free = Base.extend({
  type: z.literal("free"),
  body: z.string().max(100_000).optional(),
  body_delta: BodyDeltaSchema.nullable().optional(),
});

const Cornell = Base.extend({
  type: z.literal("cornell"),
  body: z.string().max(100_000).optional(),
  body_delta: BodyDeltaSchema.nullable().optional(),
  cornell_cue: z.string().trim().max(10_000).nullable().optional(),
  cornell_cue_delta: CornellDeltaSchema.nullable().optional(),
  cornell_summary: z.string().trim().max(10_000).nullable().optional(),
  cornell_summary_delta: CornellDeltaSchema.nullable().optional(),
});

export const CreateNoteSchema = z.discriminatedUnion("type", [Free, Cornell]);
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    type: z.enum(["free", "cornell"]).optional(),
    body: z.string().max(100_000).nullable().optional(),
    body_delta: BodyDeltaSchema.nullable().optional(),
    cornell_cue: z.string().trim().max(10_000).nullable().optional(),
    cornell_cue_delta: CornellDeltaSchema.nullable().optional(),
    cornell_summary: z.string().trim().max(10_000).nullable().optional(),
    cornell_summary_delta: CornellDeltaSchema.nullable().optional(),
    is_pinned: z.boolean().optional(),
  });
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

export const SyncNotePayloadSchema = z
  .object({
    type: z.enum(["free", "cornell"]).optional(),
    body: z.string().max(100_000).nullable().optional(),
    body_delta: BodyDeltaSchema.nullable().optional(),
    cornell_cue: z.string().trim().max(10_000).nullable().optional(),
    cornell_cue_delta: CornellDeltaSchema.nullable().optional(),
    cornell_summary: z.string().trim().max(10_000).nullable().optional(),
    cornell_summary_delta: CornellDeltaSchema.nullable().optional(),
  })
  .passthrough();

export const NoteLinkSchema = z.object({
  targetId: z.uuid(),
  label: z.string().trim().max(100).optional(),
});
export type NoteLinkInput = z.infer<typeof NoteLinkSchema>;

export const NoteTodoLinkSchema = z.object({
  todoId: z.uuid(),
});
export type NoteTodoLinkInput = z.infer<typeof NoteTodoLinkSchema>;

export const AttachTagSchema = z.union([
  z.object({ tagId: z.uuid() }),
  z.object({
    name: z.string().trim().min(1).max(64),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "color must be hex like #aabbcc")
      .optional(),
  }),
]);
export type AttachTagInput = z.infer<typeof AttachTagSchema>;

export const ListNotesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["free", "cornell"]).optional(),
  pinned: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type ListNotesQueryInput = z.infer<typeof ListNotesQuerySchema>;
