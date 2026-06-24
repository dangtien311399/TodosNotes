import { z } from "zod";

const MAX_DELTA_OPERATIONS = 10_000;
const MAX_DELTA_JSON_LENGTH = 500_000;

const QuillEmbedSchema = z
  .record(z.string().min(1), z.unknown())
  .refine((value) => Object.keys(value).length === 1, {
    message: "Quill embed insert must contain exactly one key",
  });

export const QuillDeltaOperationSchema = z
  .object({
    insert: z.union([z.string(), QuillEmbedSchema]),
    attributes: z.record(z.string().min(1), z.unknown()).optional(),
  })
  .strict();

export const QuillDeltaSchema = z
  .object({
    ops: z
      .array(QuillDeltaOperationSchema)
      .min(1)
      .max(MAX_DELTA_OPERATIONS),
  })
  .strict()
  .superRefine((delta, ctx) => {
    let serialized: string;
    try {
      serialized = JSON.stringify(delta);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Quill Delta must be JSON serializable",
      });
      return;
    }

    if (serialized.length > MAX_DELTA_JSON_LENGTH) {
      ctx.addIssue({
        code: "too_big",
        maximum: MAX_DELTA_JSON_LENGTH,
        origin: "string",
        inclusive: true,
        message: `Quill Delta JSON must not exceed ${MAX_DELTA_JSON_LENGTH} characters`,
      });
    }
  });

export type QuillDelta = z.infer<typeof QuillDeltaSchema>;

export const quillDeltaToPlainText = (delta: QuillDelta): string => {
  const text = delta.ops
    .map((operation) =>
      typeof operation.insert === "string" ? operation.insert : ""
    )
    .join("");

  // Quill documents commonly end with a structural newline. It is not part
  // of the user's visible content, so omit one trailing sentinel for FTS/preview.
  return text.endsWith("\n") ? text.slice(0, -1) : text;
};

export const serializeQuillDelta = (
  delta: QuillDelta | null
): string | null => (delta === null ? null : JSON.stringify(delta));

export const parseStoredQuillDelta = (
  value: unknown
): QuillDelta | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("Stored Quill Delta must be a JSON string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Stored Quill Delta contains invalid JSON");
  }

  const result = QuillDeltaSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Stored Quill Delta does not match quill_delta_v1");
  }
  return result.data;
};
